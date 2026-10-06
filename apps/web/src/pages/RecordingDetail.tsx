import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, fetchAudioBlob, type RecordingDetail } from "../lib/api";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Text({ children }: { children: string }) {
    const parts = children.split(/(\[unclear\])/g);
    return <>{parts.map((p, i) => (p === "[unclear]" ? <mark key={i} className="unclear">unclear</mark> : p))}</>;
  }

export default function RecordingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [time, setTime] = useState(0);        // current playback position, in seconds
  const [showRaw, setShowRaw] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["recording", id],
    queryFn: () => api<RecordingDetail>(`/recordings/${id}`),
    // Keep polling while the pipeline is running, then stop.
    refetchInterval: (q) => (q.state.data?.recording.status === "processing" ? 3000 : false),
  });

  // Load the audio once and turn it into a playable local URL.
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetchAudioBlob(id!)
      .then((b) => { if (!cancelled) { url = URL.createObjectURL(b); setAudioUrl(url); } })
      .catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [id]);

  if (isLoading) return <p className="muted">Loading…</p>;
  if (error || !data) return <div className="error">{error?.message ?? "Not found"}</div>;

  const { recording, turns, summary } = data;
  const turnByIdx = new Map(turns.map((t) => [t.idx, t]));
  const multiSpeaker = new Set(turns.map((t) => t.speaker)).size > 1;
  // The active line is the last turn that has already started.
  const activeIdx = time > 0 ? turns.filter((t) => t.start <= time).at(-1)?.idx : undefined;

  function seek(t: number, play: boolean) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t;
    if (play) a.play().catch(() => {});
  }

  function jumpToTurn(idx: number) {
    const turn = turnByIdx.get(idx);
    if (!turn) return;
    document.getElementById(`turn-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(idx);
    setTimeout(() => setFlash(null), 1800);
    seek(turn.start, false);
  }

  // Small time chips linking an item back to the transcript lines it came from.
  const Cites = ({ ids }: { ids: number[] }) => (
    <span className="cites">
      {ids.filter((i) => turnByIdx.has(i)).map((i) => (
        <button key={i} className="cite" onClick={() => jumpToTurn(i)} title="Show in transcript">
          {mmss(turnByIdx.get(i)!.start)}
        </button>
      ))}
    </span>
  );

  return (
    <>
      <div>
        <Link to="/" className="back">← All recordings</Link>
        <div className="head" style={{ marginTop: 8 }}>
          <h1 style={{ fontSize: 30 }}>{recording.title}</h1>
          {recording.meetingType && <span className="chip">{recording.meetingType}</span>}
        </div>
      </div>

      <div className="card player">
        {audioUrl ? (
          <audio ref={audioRef} src={audioUrl} controls onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} />
        ) : (
          <span className="muted">Loading audio…</span>
        )}
      </div>

      {recording.status === "processing" && (
        <div className="banner">Working on it: transcribing and summarizing. This page updates by itself.</div>
      )}
      {recording.status === "failed" && <div className="error">Processing failed: {recording.errorMessage}</div>}

      {summary && (
        <section className="card">
          <h2>Summary</h2>
          <p style={{ marginTop: 10 }}>{summary.summary}</p>
          {summary.topics.length > 0 && (
            <div className="chips">{summary.topics.map((t) => <span className="chip" key={t}>{t}</span>)}</div>
          )}

          <div className="sec-title">Decisions</div>
          {summary.decisions.length === 0 ? (
            <p className="muted">No clear decisions were made.</p>
          ) : (
            <ul className="list">
              {summary.decisions.map((d, i) => (
                <li key={i}><span>{d.text}</span><Cites ids={d.sourceTurnIds} /></li>
              ))}
            </ul>
          )}

          <div className="sec-title">Action items</div>
          {summary.actionItems.length === 0 ? (
            <p className="muted">No action items.</p>
          ) : (
            <ul className="list">
              {summary.actionItems.map((a, i) => (
                <li key={i}>
                  <span>
                    {a.task}
                    {(a.owner || a.due) && (
                      <span className="muted"> · {[a.owner, a.due].filter(Boolean).join(" · ")}</span>
                    )}
                  </span>
                  <Cites ids={a.sourceTurnIds} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {turns.length > 0 && (
        <section className="card">
          <div className="head" style={{ marginBottom: 8 }}>
            <h2>Transcript</h2>
            <label className="muted" style={{ fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} /> Show original text
            </label>
          </div>
          {turns.map((t) => (
            <div key={t.id} id={`turn-${t.idx}`}
              className={`turn ${activeIdx === t.idx ? "active" : ""} ${flash === t.idx ? "flash" : ""}`}>
              <button className="time" onClick={() => seek(t.start, true)} title="Play from here">{mmss(t.start)}</button>
              <div>
                {(multiSpeaker || t.overlap || t.uncertain) && (
                  <div className="who">
                    {multiSpeaker && t.speaker}
                    {t.overlap && <span className="tag">overlap</span>}
                    {t.uncertain && <span className="tag warn">uncertain</span>}
                  </div>
                )}
                {/* <p>{showRaw ? t.text.trim() : (t.refinedText ?? t.text).trim()}</p> */}
                <p><Text>{showRaw ? t.text.trim() : (t.refinedText ?? t.text).trim()}</Text></p>
                {!showRaw && t.translation && <p className="translation">{t.translation}</p>}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}