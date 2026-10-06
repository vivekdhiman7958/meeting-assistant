import os
import tempfile

from fastapi import FastAPI, File, Form, UploadFile
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio

MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE = os.getenv("WHISPER_COMPUTE", "int8")
DIARIZE_MODEL = os.getenv("DIARIZE_MODEL", "pyannote/speaker-diarization-community-1")
HF_TOKEN = os.getenv("HF_TOKEN")
MAX_AUDIO_SECONDS = int(os.getenv("MAX_AUDIO_SECONDS", "0"))  # 0 = no limit; a demo/dev knob

SAMPLE_RATE = 16000  # both Whisper and pyannote expect 16 kHz mono
GAP_SECONDS = 1.5    # same speaker + a pause longer than this = start a new turn
MAX_TURN_SECONDS = 20  # once a turn is longer than this, split at the next sentence end

app = FastAPI()
model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE)

# Diarization is optional: if the token is missing or loading fails, the service still
# transcribes and labels everyone "Speaker 1" instead of crashing.
diarizer = None
if HF_TOKEN:
    try:
        from pyannote.audio import Pipeline

        diarizer = Pipeline.from_pretrained(DIARIZE_MODEL, token=HF_TOKEN)
    except Exception as e:
        print(f"[ml] diarization disabled: {e}")
else:
    print("[ml] HF_TOKEN not set, diarization disabled")


def run_diarization(audio, num_speakers):
    import torch

    # Pass the audio from memory. The pipeline then never has to decode the file itself.
    waveform = torch.from_numpy(audio).unsqueeze(0)  # shape (1, samples)
    out = diarizer(
        {"waveform": waveform, "sample_rate": SAMPLE_RATE},
        num_speakers=num_speakers,  # None = let pyannote guess
    )
    # community-1 returns an object with two annotations; older versions return one.
    regular = getattr(out, "speaker_diarization", out)
    exclusive = getattr(out, "exclusive_speaker_diarization", regular)

    def to_list(annotation):
        return [(t.start, t.end, label) for t, _, label in annotation.itertracks(yield_label=True)]

    return to_list(exclusive), to_list(regular)


def name_speakers(segments):
    # pyannote labels look like "SPEAKER_00". Rename in order of first appearance.
    names = {}
    for _, _, label in sorted(segments):
        names.setdefault(label, f"Speaker {len(names) + 1}")
    return names


def speaker_at(t0, t1, segments):
    # Which speaker owns the middle of this word? If nobody, take the nearest segment.
    mid = (t0 + t1) / 2
    best, best_dist = None, float("inf")
    for s, e, label in segments:
        if s <= mid <= e:
            return label
        dist = min(abs(mid - s), abs(mid - e))
        if dist < best_dist:
            best, best_dist = label, dist
    return best


def is_overlap(t0, t1, segments):
    # True if two or more different speakers are active during this word.
    labels = {label for s, e, label in segments if min(e, t1) - max(s, t0) > 0.05}
    return len(labels) >= 2


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_SIZE, "device": DEVICE, "diarization": diarizer is not None}


@app.post("/transcribe")
def transcribe(file: UploadFile = File(...), num_speakers: int | None = Form(None)):
    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file.file.read())
        path = tmp.name
    try:
        # Decode ONCE into a 16 kHz mono float array; reuse it for Whisper and pyannote.
        audio = decode_audio(path, sampling_rate=SAMPLE_RATE)
    finally:
        os.remove(path)  # the temp file isn't needed any more
    
    if MAX_AUDIO_SECONDS:
        audio = audio[: MAX_AUDIO_SECONDS * SAMPLE_RATE]  # only process the first N seconds
    segments, info = model.transcribe(
        audio,
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
        word_timestamps=True,  # we need per-word times to assign speakers
    )
    words = [w for seg in segments for w in (seg.words or [])]

    exclusive, regular, names = [], [], {}
    if diarizer is not None:
        exclusive, regular = run_diarization(audio, num_speakers)
        names = name_speakers(exclusive)

    # Group consecutive words into turns.
    grouped = []
    cur = None
    for w in words:
        speaker = names.get(speaker_at(w.start, w.end, exclusive), "Speaker 1")
        over = is_overlap(w.start, w.end, regular) if regular else False
        # if cur and cur["speaker"] == speaker and w.start - cur["end"] <= GAP_SECONDS:
        too_long = cur and (cur["end"] - cur["start"]) > MAX_TURN_SECONDS and cur["words"][-1].word.rstrip().endswith((".", "?", "!"))
        if cur and cur["speaker"] == speaker and w.start - cur["end"] <= GAP_SECONDS and not too_long:
            cur["words"].append(w)
            cur["end"] = w.end
            cur["overlap"] = cur["overlap"] or over
        else:
            if cur:
                grouped.append(cur)
            cur = {"speaker": speaker, "start": w.start, "end": w.end, "overlap": over, "words": [w]}
    if cur:
        grouped.append(cur)

    turns = []
    for i, t in enumerate(grouped):
        probs = [w.probability for w in t["words"]]
        turns.append(
            {
                "id": i,
                "speaker": t["speaker"],
                "start": round(t["start"], 2),
                "end": round(t["end"], 2),
                "text": "".join(w.word for w in t["words"]).strip(),
                "confidence": round(sum(probs) / len(probs), 3),  # mean word probability
                "overlap": bool(t["overlap"]),
            }
        )

    return {"durationSec": len(audio) / SAMPLE_RATE, "language": info.language, "turns": turns}