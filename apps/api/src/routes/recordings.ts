import { Hono } from "hono";
import { z } from "zod";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { CreateRecordingSchema } from "@ma/shared";
import { db, UPLOADS_DIR } from "../db";
import { recordings, summaries, turns } from "../db/schema";
import { requireAuth, type AuthEnv } from "../middleware/auth";
import { processRecording } from "../jobs/process";
import { refineRecording } from "../services/refine";
import { summarizeRecording } from "../services/summarize";

export const recordingRoutes = new Hono<AuthEnv>();

// Every route in this file needs a logged-in user.
recordingRoutes.use("*", requireAuth);

// Allow-list: MIME type -> file extension we will use on disk.
const AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "webm", // what browser MediaRecorder produces
  "audio/ogg": "ogg",
  "audio/flac": "flac",
};
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

// The client never needs to see where the file sits on our disk.
function publicRecording(r: typeof recordings.$inferSelect) {
  const { audioPath, ...rest } = r;
  return rest;
}

// Fetch a recording ONLY if it belongs to this user.
function findOwned(id: string, userId: string) {
  return db.query.recordings.findFirst({
    where: and(eq(recordings.id, id), eq(recordings.userId, userId)),
  });
}

recordingRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const form = await c.req.parseBody();
  const file = form["file"];

  if (!(file instanceof File)) {
    return c.json({ error: "Audio file is required (form field: file)" }, 400);
  }
  const parsed = CreateRecordingSchema.safeParse({ title: form["title"] });
  if (!parsed.success) return c.json({ error: "A title is required" }, 400);

  // "audio/webm;codecs=opus" -> "audio/webm"
  const ext = AUDIO_TYPES[file.type.split(";")[0]];
  if (!ext) return c.json({ error: `Unsupported audio type: ${file.type}` }, 415);
  if (file.size > MAX_BYTES) return c.json({ error: "File too large (max 100 MB)" }, 413);

  const id = crypto.randomUUID();
  // Relative path, so the project folder can move without breaking old rows.
  const audioPath = `${userId}/${id}.${ext}`;
  mkdirSync(join(UPLOADS_DIR, userId), { recursive: true });
  await Bun.write(join(UPLOADS_DIR, audioPath), file);

  try {
    const [rec] = await db
      .insert(recordings)
      .values({ id, userId, title: parsed.data.title, audioPath })
      .returning();
    return c.json({ recording: publicRecording(rec) }, 201);
  } catch (err) {
    // Don't leave an orphan file behind if the DB insert fails.
    await unlink(join(UPLOADS_DIR, audioPath)).catch(() => {});
    throw err;
  }
});

recordingRoutes.post("/:id/refine", async (c) => {
  const rec = await findOwned(c.req.param("id"), c.get("userId"));
  if (!rec) return c.json({ error: "Not found" }, 404);
  if (rec.status === "processing") return c.json({ error: "Already processing" }, 409);

  // Runs in the background; the transcript stays available the whole time.
  void refineRecording(rec.id).catch((e) => console.error("[refine] failed:", e));
  return c.json({ status: "refining" }, 202);
});

recordingRoutes.post("/:id/summarize", async (c) => {
  const rec = await findOwned(c.req.param("id"), c.get("userId"));
  if (!rec) return c.json({ error: "Not found" }, 404);
  if (rec.status === "processing") return c.json({ error: "Already processing" }, 409);

  void summarizeRecording(rec.id).catch((e) => console.error("[summarize] failed:", e));
  return c.json({ status: "summarizing" }, 202);
});

recordingRoutes.get("/", async (c) => {
  const rows = await db
    .select()
    .from(recordings)
    .where(eq(recordings.userId, c.get("userId")))
    .orderBy(desc(recordings.createdAt));
  return c.json({ recordings: rows.map(publicRecording) });
});

recordingRoutes.get("/:id", async (c) => {
  const rec = await findOwned(c.req.param("id"), c.get("userId"));
  if (!rec) return c.json({ error: "Not found" }, 404);

  const turnRows = await db
    .select()
    .from(turns)
    .where(eq(turns.recordingId, rec.id))
    .orderBy(asc(turns.idx));
  const summary = await db.query.summaries.findFirst({
    where: eq(summaries.recordingId, rec.id),
  });

  return c.json({ recording: publicRecording(rec), turns: turnRows, summary: summary ?? null });
});

recordingRoutes.get("/:id/audio", async (c) => {
  const rec = await findOwned(c.req.param("id"), c.get("userId"));
  if (!rec) return c.json({ error: "Not found" }, 404);

  const file = Bun.file(join(UPLOADS_DIR, rec.audioPath));
  if (!(await file.exists())) return c.json({ error: "Audio file missing" }, 404);
  return new Response(file); // Bun sets Content-Type from the extension
});

// NEW: start transcription for a recording.
// recordingRoutes.post("/:id/process", async (c) => {
//   const rec = await findOwned(c.req.param("id"), c.get("userId"));
//   if (!rec) return c.json({ error: "Not found" }, 404);

//   // Claim the job atomically: this UPDATE only succeeds if the status is NOT already
//   // "processing", so two quick requests can't start two jobs.
//   const claimed = await db
//     .update(recordings)
//     .set({ status: "processing", errorMessage: null })
//     .where(and(eq(recordings.id, rec.id), ne(recordings.status, "processing")))
//     .returning({ id: recordings.id });
//   if (claimed.length === 0) return c.json({ error: "Already processing" }, 409);

//   void processRecording(rec.id); // NOT awaited: it runs in the background
//   return c.json({ status: "processing" }, 202);
// });


recordingRoutes.post("/:id/process", async (c) => {
    const rec = await findOwned(c.req.param("id"), c.get("userId"));
    if (!rec) return c.json({ error: "Not found" }, 404);
  
    // Optional body: {"numSpeakers": 3}. No body at all is fine.
    const body = await c.req.json().catch(() => ({}));
    const parsed = z.number().int().min(1).max(10).optional().safeParse(body?.numSpeakers);
    if (!parsed.success) return c.json({ error: "numSpeakers must be 1-10" }, 400);
  
    const claimed = await db
      .update(recordings)
      .set({ status: "processing", errorMessage: null })
      .where(and(eq(recordings.id, rec.id), ne(recordings.status, "processing")))
      .returning({ id: recordings.id });
    if (claimed.length === 0) return c.json({ error: "Already processing" }, 409);
  
    void processRecording(rec.id, parsed.data);
    return c.json({ status: "processing" }, 202);
  });

recordingRoutes.delete("/:id", async (c) => {
  const rec = await findOwned(c.req.param("id"), c.get("userId"));
  if (!rec) return c.json({ error: "Not found" }, 404);

  // Cascade deletes its turns and summary automatically.
  await db.delete(recordings).where(eq(recordings.id, rec.id));
  await unlink(join(UPLOADS_DIR, rec.audioPath)).catch(() => {});
  return c.json({ ok: true });
});