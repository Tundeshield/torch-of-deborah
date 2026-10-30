import { Link } from "react-router-dom";
import { useSite } from "../../components/PublicLayout.jsx";
import { formatTime12 } from "../../lib/shared.js";
import { getHubKey } from "../../lib/device.js";

const FAQ = [
  ["Who can join?", "Any woman who wants to pray for Nigeria, in Nigeria or abroad. You don't need to belong to a particular church."],
  ["Does it cost anything?", "No. It is free."],
  ["What is a prayer hub?", "About 20 women from your state, with a hub leader, who pray and encourage each other in a WhatsApp group."],
  ["What if I miss the daily prayer meeting?", "That's fine. Pray at the same hour wherever you are. No one is penalised."],
  ["I live outside Nigeria.", "You're welcome. Choose “Outside Nigeria” as your state when you register."],
];

export default function Home() {
  const site = useSite();
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>Arise. Pray. Mobilise.<em>Impact Nigeria.</em></h1>
          <p>10,000 women praying together for Nigeria, every day, for six months. Join a small prayer hub of women from your state.</p>
          <div className="actions">
            <Link to="/join" className="btn light">Join the movement</Link>
            {getHubKey() && <Link to="/my-hub" className="text">Go to my hub</Link>}
          </div>
        </div>
      </section>

      <div className="wrap">
        <section className="section">
          <h2>How it works</h2>
          <ol className="steps">
            <li><b>Register</b><span>It takes about two minutes on your phone.</span></li>
            <li><b>Join your hub</b><span>We place you in a prayer hub in your state. Tap to join its WhatsApp group.</span></li>
            <li><b>Pray every day</b><span>One hour a day{site.dailyTime ? `, from ${formatTime12(site.dailyTime)}` : ""}, together on Zoom or wherever you are.</span></li>
          </ol>
        </section>

        <section className="section">
          <h2>Why we pray</h2>
          <p className="lede">The Torch of Deborah calls women to arise like Deborah: to stand in the gap for our nation, pray with one voice and carry that prayer into our homes and communities.</p>
          <blockquote className="quote">
            Until that I Deborah arose, that I arose a mother in Israel.
            <cite>Judges 5:7</cite>
          </blockquote>
        </section>

        <section className="section">
          <h2>Questions</h2>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </section>

        <section className="cta">
          <h2>Will you answer the call?</h2>
          <Link to="/join" className="btn">Join the movement</Link>
        </section>
      </div>
    </>
  );
}
