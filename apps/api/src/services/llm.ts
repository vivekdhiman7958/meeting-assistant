import { z } from "zod";
import { LLM } from "../config";

// Calls the chat API, forces JSON output, and validates it with a Zod schema.
// LLMs sometimes return broken JSON, so we retry instead of trusting one attempt.
export async function chatJson<S extends z.ZodTypeAny>(
  system: string,
  user: string,
  schema: S,
  retries = 2,
): Promise<z.infer<S>> {
  if (!LLM.apiKey) throw new Error("Set LLM_API_KEY in apps/api/.env");

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${LLM.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${LLM.apiKey}` },
        body: JSON.stringify({
          model: LLM.model,
          temperature: 0.2, // low = consistent, fewer creative "fixes"
          response_format: { type: "json_object" }, // provider guarantees syntactically valid JSON
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (res.status === 429) {
        // Rate limited (common on free tiers): wait as long as the server says, then retry.
        await Bun.sleep(Number(res.headers.get("retry-after") ?? 5) * 1000);
        throw new Error("LLM rate limited");
      }
      if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);

      const data: any = await res.json();
      return schema.parse(JSON.parse(data.choices[0].message.content));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}