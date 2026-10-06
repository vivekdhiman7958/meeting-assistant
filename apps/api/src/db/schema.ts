import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
// import { MEETING_TYPES, RECORDING_STATUSES, type ActionItem } from "@ma/shared";
import { MEETING_TYPES, RECORDING_STATUSES, type ActionItem, type Decision } from "@ma/shared";


// Reusable column builders so every table has the same id and timestamp style.
const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`);

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const recordings = sqliteTable(
  "recordings",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    audioPath: text("audio_path").notNull(), // file lives on disk, DB only stores the path
    durationSec: real("duration_sec"),
    status: text("status", { enum: RECORDING_STATUSES }).notNull().default("uploaded"),
    meetingType: text("meeting_type", { enum: MEETING_TYPES }),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
  },
  (t) => [index("recordings_user_idx").on(t.userId)],
);

export const turns = sqliteTable(
  "turns",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordingId: text("recording_id").notNull().references(() => recordings.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(), // order inside the recording
    speaker: text("speaker").notNull(),
    start: real("start").notNull(),
    end: real("end").notNull(),
    text: text("text").notNull(),
    confidence: real("confidence").notNull(),
    overlap: integer("overlap", { mode: "boolean" }).notNull().default(false),
    refinedText: text("refined_text"),   // LLM-cleaned version; the raw text stays untouched
    translation: text("translation"),    // English line for mixed-language turns
    uncertain: integer("uncertain", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("turns_recording_idx").on(t.recordingId)],
);

export const summaries = sqliteTable("summaries", {
  recordingId: text("recording_id").primaryKey().references(() => recordings.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  topics: text("topics", { mode: "json" }).$type<string[]>().notNull(),
  // decisions: text("decisions", { mode: "json" }).$type<string[]>().notNull(),
  decisions: text("decisions", { mode: "json" }).$type<Decision[]>().notNull().default([]),
  actionItems: text("action_items", { mode: "json" }).$type<ActionItem[]>().notNull(),
  createdAt: createdAt(),
});