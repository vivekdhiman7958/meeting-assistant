import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Recording } from "../lib/api";
import { Link } from "react-router-dom";

const fmtDuration = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function Recordings() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["recordings"] });
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["recordings"],
    queryFn: () => api<{ recordings: Recording[] }>("/recordings"),
    refetchInterval: (q) => (q.state.data?.recordings.some((r) => r.status === "processing") ? 3000 : false),
  });

  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("file", file!);
      const { recording } = await api<{ recording: Recording }>("/recordings", { method: "POST", body: fd });
      await api(`/recordings/${recording.id}/process`, { method: "POST" });
    },
    onSuccess: () => { setTitle(""); setFile(null); refresh(); },
  });
  const retry = useMutation({ mutationFn: (id: string) => api(`/recordings/${id}/process`, { method: "POST" }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api(`/recordings/${id}`, { method: "DELETE" }), onSuccess: refresh });

  const recordings = data?.recordings ?? [];
  return (
    <>
      <section className="card">
        <h2 style={{ marginBottom: 14 }}>New recording</h2>
        {upload.error && <div className="error">{upload.error.message}</div>}
        <label className="drop">
          <input type="file" accept="audio/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <strong>{file ? file.name : "Choose an audio file"}</strong>
          <span className="muted">{file ? `${(file.size / 1048576).toFixed(1)} MB` : "WAV, MP3, M4A, WebM, OGG or FLAC, up to 100 MB"}</span>
        </label>
        <div className="upload-row">
          <label className="field">Title
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly sync" />
          </label>
          <button className="btn primary" disabled={!file || !title.trim() || upload.isPending} onClick={() => upload.mutate()}>
            {upload.isPending ? "Uploading…" : "Upload & process"}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 6 }}>Your recordings</h2>
        {isLoading && <p className="muted">Loading…</p>}
        {!isLoading && recordings.length === 0 && <p className="muted">Nothing here yet. Upload your first recording above.</p>}
        {recordings.map((r) => (
          <div className="rec" key={r.id}>
            <div>
              {/* <h3>{r.title}</h3> */}
              <h3><Link to={`/r/${r.id}`} className="title-link">{r.title}</Link></h3>
              <div className="meta">
                <span className={`badge ${r.status}`}>{r.status === "processing" ? "Processing…" : r.status}</span>
                {r.meetingType && <span className="chip">{r.meetingType}</span>}
                <span>{fmtDate(r.createdAt)}</span>
                {r.durationSec != null && <span>{fmtDuration(r.durationSec)}</span>}
              </div>
              {r.status === "failed" && r.errorMessage && <div className="meta" style={{ color: "#a3261b" }}>{r.errorMessage}</div>}
            </div>
            <div>
              {(r.status === "failed" || r.status === "uploaded") && (
                <button className="btn" onClick={() => retry.mutate(r.id)}>{r.status === "failed" ? "Retry" : "Process"}</button>
              )}
              <button className="btn link danger" onClick={() => confirm(`Delete "${r.title}"?`) && remove.mutate(r.id)}>Delete</button>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}