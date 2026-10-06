import { eq } from "drizzle-orm";
import { join } from "node:path";
import { db, UPLOADS_DIR } from "../db";
import { recordings, turns } from "../db/schema";
import { transcribe } from "../services/ml";
import { refineRecording } from "../services/refine";
import { summarizeRecording } from "../services/summarize";

export async function processRecording(recordingId: string, numSpeakers?: number) {
  try {
    const rec = await db.query.recordings.findFirst({
      where: eq(recordings.id, recordingId),
    });
    if (!rec) return;

    // Layers 1-5: audio to turns (the Python service).
    const result = await transcribe(join(UPLOADS_DIR, rec.audioPath), numSpeakers);

    // One transaction: either ALL of this is saved, or none of it.
    db.transaction((tx) => {
      tx.delete(turns).where(eq(turns.recordingId, recordingId)).run(); // safe to re-run
      if (result.turns.length > 0) {
        tx.insert(turns)
          .values(
            result.turns.map((t) => ({
              recordingId,
              idx: t.id,
              speaker: t.speaker,
              start: t.start,
              end: t.end,
              text: t.text,
              confidence: t.confidence,
              overlap: t.overlap,
            })),
          )
          .run();
      }
      tx.update(recordings)
        .set({ durationSec: result.durationSec })
        .where(eq(recordings.id, recordingId))
        .run();
    });

    // Layer 6: LLM refinement. If this fails we still keep the raw transcript.
    try {
      await refineRecording(recordingId);
    } catch (err) {
      console.error("[refine] failed, keeping raw transcript:", err);
    }

    // Layers 7-8: classify + summary, decisions, action items.
      try {
        await summarizeRecording(recordingId);
      } catch (err) {
        console.error("[summarize] failed:", err);
      }

    await db.update(recordings).set({ status: "done" }).where(eq(recordings.id, recordingId));
  } catch (err) {
    await db
      .update(recordings)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      .where(eq(recordings.id, recordingId));
  }
}

// If the server restarts mid-job, the job dies but the row would stay "processing"
// forever. On startup, mark any such rows as failed so the user can retry.
export async function recoverStuckJobs() {
  await db
    .update(recordings)
    .set({ status: "failed", errorMessage: "Server restarted during processing" })
    .where(eq(recordings.status, "processing"));
}