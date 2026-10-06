import { z } from "zod";
import { TurnSchema } from "@ma/shared";

const ML_URL = process.env.ML_URL ?? "http://localhost:8000";

// Validate what the Python service sends back. If it ever changes shape,
// we fail here with a clear error instead of saving garbage to the database.
const MlResponseSchema = z.object({
  durationSec: z.number(),
  language: z.string(),
  turns: z.array(TurnSchema),
});

export async function transcribe(audioPath: string, numSpeakers?: number) {
    const form = new FormData();
    form.append("file", Bun.file(audioPath)); // Bun streams the file from disk
    if (numSpeakers) form.append("num_speakers", String(numSpeakers));
  const res = await fetch(`${ML_URL}/transcribe`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30 * 60 * 1000), // give up after 30 minutes
  });
  if (!res.ok) throw new Error(`ML service ${res.status}: ${await res.text()}`);

  return MlResponseSchema.parse(await res.json());
}