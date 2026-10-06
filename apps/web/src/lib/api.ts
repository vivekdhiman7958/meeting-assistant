// import type { MeetingType, RecordingStatus } from "@ma/shared";
import type { ActionItem, Decision, MeetingType, RecordingStatus } from "@ma/shared";
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const tokenStore = {
  get: () => localStorage.getItem("token"),
  set: (t: string) => localStorage.setItem("token", t),
  clear: () => localStorage.removeItem("token"),
};

export type Recording = {
  id: string; title: string; status: RecordingStatus; meetingType: MeetingType | null;
  durationSec: number | null; errorMessage: string | null; createdAt: string;
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // For FormData (file uploads) the browser must set the Content-Type itself.
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const res = await fetch(BASE + path, { ...init, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Please check your input");
  return data as T;
}

export type TurnRow = {
    id: number; idx: number; speaker: string; start: number; end: number;
    text: string; refinedText: string | null; translation: string | null;
    uncertain: boolean; confidence: number; overlap: boolean;
  };
  export type SummaryRow = { summary: string; topics: string[]; decisions: Decision[]; actionItems: ActionItem[] };
  export type RecordingDetail = { recording: Recording; turns: TurnRow[]; summary: SummaryRow | null };
  
  // <audio src> can't send our login token, so we fetch the file ourselves
  // and hand the player a local blob: URL.
  export async function fetchAudioBlob(id: string): Promise<Blob> {
    const res = await fetch(`${BASE}/recordings/${id}/audio`, {
      headers: { Authorization: `Bearer ${tokenStore.get()}` },
    });
    if (!res.ok) throw new Error("Could not load audio");
    return res.blob();
  }