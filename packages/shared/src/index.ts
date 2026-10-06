import { z } from "zod";

export const MEETING_TYPES = ["formal", "casual", "brainstorm"] as const;
export const MeetingTypeSchema = z.enum(MEETING_TYPES);
export type MeetingType = z.infer<typeof MeetingTypeSchema>;

export const RECORDING_STATUSES = ["uploaded", "processing", "done", "failed"] as const;
export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

export const TurnSchema = z.object({
  id: z.number().int(),
  speaker: z.string(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  overlap: z.boolean(),
});
export type Turn = z.infer<typeof TurnSchema>;

// Every action item points back to the turns it came from (layer 8 rule).
// export const ActionItemSchema = z.object({
//   task: z.string(),
//   owner: z.string().nullable(),
//   due: z.string().nullable(),
//   sourceTurnIds: z.array(z.number().int()),
// });
// export type ActionItem = z.infer<typeof ActionItemSchema>;


// Every action item points back to the turns it came from (layer 8 rule).
export const ActionItemSchema = z.object({
  task: z.string(),
  owner: z.string().nullable().default(null),
  due: z.string().nullable().default(null),
  sourceTurnIds: z.array(z.number().int()),
});
export type ActionItem = z.infer<typeof ActionItemSchema>;

export const DecisionSchema = z.object({
  text: z.string(),
  sourceTurnIds: z.array(z.number().int()),
});
export type Decision = z.infer<typeof DecisionSchema>;

// What the summary LLM must return. .default([]) tolerates a model that omits an empty list.
export const SummaryResultSchema = z.object({
  summary: z.string(),
  topics: z.array(z.string()).default([]),
  decisions: z.array(DecisionSchema).default([]),
  actionItems: z.array(ActionItemSchema).default([]),
});
export type SummaryResult = z.infer<typeof SummaryResultSchema>;


export const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const CreateRecordingSchema = z.object({
  title: z.string().trim().min(1).max(120),
});