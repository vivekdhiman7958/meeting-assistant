import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

const features = [
  { t: "A transcript you can check", d: "Every line keeps its original wording next to the cleaned version, so you can always see what the AI changed." },
  { t: "Summaries with receipts", d: "Decisions and action items link back to the moment they came from. Click a time and the audio jumps there." },
  { t: "Honest about messy audio", d: "Casual chats, mixed languages and crosstalk get flagged as uncertain instead of being quietly guessed." },
];
const steps = ["Upload a recording", "Speech becomes text", "AI cleans and cross-checks it", "Read the summary and tasks"];

export default function Landing() {
  const { user } = useAuth();
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link to="/" className="brand">Recap<span>.</span></Link>
          <div className="meta">
            {user ? (
              <Link to="/app" className="btn primary">Open app</Link>
            ) : (
              <>
                <Link to="/login" className="btn link">Log in</Link>
                <Link to="/register" className="btn primary">Get started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="land">
        <section className="hero">
          <div>
            <h1>Every conversation, understood.</h1>
            <p className="lead">
              Upload a recording of a meeting or a casual chat. Recap turns it into a clean transcript,
              a short summary and a list of action items you can trace back to the audio.
            </p>
            <div className="cta">
              <Link to={user ? "/app" : "/register"} className="btn primary big">
                {user ? "Open your recordings" : "Try it free"}
              </Link>
              <a href="#how" className="btn big">How it works</a>
            </div>
          </div>

          <div className="card mock" aria-hidden>
            <div className="head">
              <h3>Weekly sync</h3>
              <span className="chip">brainstorm</span>
            </div>
            <p className="muted" style={{ margin: "10px 0 14px" }}>
              The team compared word-level and sentence-level importance scores and agreed to test both together.
            </p>
            <div className="sec-title" style={{ marginTop: 0 }}>Action items</div>
            <ul className="list">
              <li><span>Test both scoring approaches in the player</span><span className="cites"><span className="cite">1:43</span></span></li>
              <li><span>Share the results with the team</span><span className="cites"><span className="cite">2:10</span></span></li>
            </ul>
          </div>
        </section>

        <section className="features">
          {features.map((f) => (
            <div className="card" key={f.t}>
              <h3>{f.t}</h3>
              <p className="muted" style={{ marginTop: 8 }}>{f.d}</p>
            </div>
          ))}
        </section>

        <section id="how" className="how">
          <h2>How it works</h2>
          <ol>
            {steps.map((s, i) => (
              <li key={s}><span className="num">{i + 1}</span>{s}</li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="foot muted">Recap · Built for the Inter IIT Tech Meet ML problem statement</footer>
    </>
  );
}