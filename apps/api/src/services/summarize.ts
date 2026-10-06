import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { MeetingTypeSchema, SummaryResultSchema, type MeetingType } from "@ma/shared";
import { db } from "../db";
import { recordings, summaries, turns } from "../db/schema";
import { chatJson } from "./llm";

const MAX_CHARS = 12_000; // transcript characters sent per LLM call

const ClassifySchema = z.object({ meetingType: MeetingTypeSchema });

const CLASSIFY_PROMPT = `You classify spoken conversations. Read the transcript excerpt and decide:
- "formal": a structured meeting with an agenda, people taking turns, decisions or tasks
- "casual": relaxed everyday conversation, no agenda
- "brainstorm": people are mainly generating and discussing ideas
Reply with JSON only: {"meetingType":"formal"|"casual"|"brainstorm"}`;

// Layer 7's whole point: different conversations need different summaries.
const STYLE: Record<MeetingType, string> = {
  formal:
    "This is a formal meeting. Write a concise summary paragraph. List decisions that were clearly made, and action items (who does what, by when if stated).",
  casual:
    "This is a casual conversation. Write a short, friendly summary of 2-4 sentences about what was talked about. List only decisions that were clearly made and tasks someone clearly committed to. Empty lists are fine and expected.",
  brainstorm:
    "This is a brainstorming session. Summarize the main ideas discussed. In 'decisions' list ideas the group chose to pursue. In 'actionItems' list follow-ups someone committed to.",
};

const RULES = `Rules:
- Use only what the transcript says. Never invent decisions, owners or dates.
- If no owner or due date is stated, use null.
- Every decision and action item must list, in "sourceTurnIds", the ids of the turns it comes from. Ids are the numbers in [brackets] at the start of each line.
- Lines marked [?] are uncertain. Do not base a decision or task on them alone.
- "topics" is 2 to 6 short phrases.
Reply with JSON only: {"summary":string,"topics":string[],"decisions":[{"text":string,"sourceTurnIds":number[]}],"actionItems":[{"task":string,"owner":string|null,"due":string|null,"sourceTurnIds":number[]}]}`;

const MERGE_PROMPT = `You are given partial summaries, in JSON, of consecutive parts of ONE conversation.
Combine them into a single summary of the whole conversation. Remove duplicates, keep every sourceTurnIds list, and keep the same JSON shape.
${RULES}`;

export async function summarizeRecording(recordingId: string) {
  const rows = await db
    .select()
    .from(turns)
    .where(eq(turns.recordingId, recordingId))
    .orderBy(asc(turns.idx));
  if (rows.length === 0) return;

  // One line per turn, using the cleaned text when we have it.
  const lines = rows.map((r) => {
    const flag = r.uncertain ? " [?]" : "";
    return `[${r.idx}] ${r.speaker}${flag}: ${r.refinedText ?? r.text}`;
  });
  const validIds = new Set(rows.map((r) => r.idx));

  // 1. Classify from the start of the conversation.
  let excerpt = "";
  for (const line of lines) {
    if (excerpt.length + line.length > 6000) break;
    excerpt += line + "\n";
  }
  const { meetingType } = await chatJson(CLASSIFY_PROMPT, excerpt, ClassifySchema);

  // 2. Split into chunks so long meetings fit in the model's limits.
  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (cur && cur.length + line.length > MAX_CHARS) {
      chunks.push(cur);
      cur = "";
    }
    cur += line + "\n";
  }
  if (cur) chunks.push(cur);

  // 3. Summarize each chunk, then merge if there was more than one.
  const system = `${STYLE[meetingType]}\n${RULES}`;
  const partials = [];
  for (const chunk of chunks) partials.push(await chatJson(system, chunk, SummaryResultSchema));
  const result =
    partials.length === 1
      ? partials[0]
      : await chatJson(MERGE_PROMPT, JSON.stringify(partials), SummaryResultSchema);

  // 4. Don't trust the model's citations: keep only ids that really exist,
  //    and drop any item left with no valid citation (the "drop unsupported" rule).
  const cited = <T extends { sourceTurnIds: number[] }>(items: T[]) =>
    items
      .map((i) => ({ ...i, sourceTurnIds: i.sourceTurnIds.filter((id) => validIds.has(id)) }))
      .filter((i) => i.sourceTurnIds.length > 0);

  const values = {
    summary: result.summary,
    topics: result.topics,
    decisions: cited(result.decisions),
    actionItems: cited(result.actionItems),
  };

  await db
    .insert(summaries)
    .values({ recordingId, ...values })
    .onConflictDoUpdate({ target: summaries.recordingId, set: values }); // safe to re-run
  await db.update(recordings).set({ meetingType }).where(eq(recordings.id, recordingId));

  console.log(
    `[summarize] ${meetingType}: ${chunks.length} chunk(s), ${values.decisions.length} decisions, ${values.actionItems.length} action items`,
  );
}