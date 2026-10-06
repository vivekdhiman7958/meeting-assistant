import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { turns } from "../db/schema";
import { chatJson } from "./llm";

const WINDOW = 8;   // turns refined per LLM call (smaller = more reliable output)
const CONTEXT = 2;  // already-refined turns shown before the window, for reference only

const PROMPT = `You clean up noisy speech-to-text transcripts of spoken conversations.
The text may contain misheard words, broken punctuation, wrong sentence boundaries, and mixed languages (for example Hindi and English).

For each turn in "turns", return a corrected version. Return exactly one entry for EVERY turn in "turns", using the same "id" values you were given.
Rules:
- Keep every word the speaker said, including repetitions and filler words. Do not delete or summarize anything.
- Only change a word when it is clearly misheard and the surrounding context makes the correct word obvious. Otherwise fix only punctuation and casing.
- Never invent content. Never merge or split turns.
- If a phrase is unclear and the context does not resolve it, keep the original words and add [unclear] right after them. Do not replace them.
- If a turn mixes languages, keep the original words in "text" (do not translate them) and put a full English translation in "translation". If the turn is already English, translation must be null.
- Set "uncertain" to true when you were not confident about a change, or the turn contains [unclear].
- Turns with overlap=true had several people speaking at once, so they may be incomplete or have mixed-up words. Be extra cautious with them.
- "context" turns are for reference only. Do not return them.

Reply with JSON only: {"turns":[{"id":number,"text":string,"translation":string|null,"uncertain":boolean}]}`;

const RefinedSchema = z.object({
  turns: z.array(
    z.object({
      id: z.number().int(),
      text: z.string(),
      translation: z.string().nullable().optional(),
      uncertain: z.boolean().optional(),
    }),
  ),
});

type Row = typeof turns.$inferSelect;

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export async function refineRecording(recordingId: string) {
  const rows = await db
    .select()
    .from(turns)
    .where(eq(turns.recordingId, recordingId))
    .orderBy(asc(turns.idx));

  for (let i = 0; i < rows.length; i += WINDOW) {
    const target = rows.slice(i, i + WINDOW);
    const context = rows.slice(Math.max(0, i - CONTEXT), i);

    const slim = (r: Row, refined: boolean) => ({
      id: r.idx,
      speaker: r.speaker,
      text: refined ? (r.refinedText ?? r.text) : r.text,
      confidence: r.confidence,
      overlap: r.overlap,
    });

    const out = await chatJson(
      PROMPT,
      JSON.stringify({ context: context.map((r) => slim(r, true)), turns: target.map((r) => slim(r, false)) }),
      RefinedSchema,
    );
    const byId = new Map(out.turns.map((t) => [t.id, t]));

    // Fallback: if the model renumbered the turns but returned the right COUNT,
    // match them by position instead of by id.
    const positional = out.turns.length === target.length && target.some((r) => !byId.has(r.idx));

    let matched = 0;
    for (const [k, row] of target.entries()) {
      const fixed = positional ? out.turns[k] : byId.get(row.idx);
      if (!fixed || !fixed.text.trim()) continue;

      // Guard: a rewrite that lost a lot of words probably deleted content. Keep the raw text.
      if (wordCount(fixed.text) < wordCount(row.text) * 0.8) {
        await db.update(turns).set({ uncertain: true }).where(eq(turns.id, row.id));
        continue;
      }

      matched++;
      row.refinedText = fixed.text; // so the next window sees refined context
      await db
        .update(turns)
        .set({
          refinedText: fixed.text,
          translation: fixed.translation ?? null,
          uncertain: fixed.uncertain ?? row.confidence < 0.5,
        })
        .where(eq(turns.id, row.id));
    }

    console.log(
      `[refine] window ${i / WINDOW + 1}: sent ${target.length}, got ${out.turns.length}, applied ${matched}${positional ? " (matched by position)" : ""}`,
    );
  }
}