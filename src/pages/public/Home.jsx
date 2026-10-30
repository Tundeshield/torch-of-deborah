import { Link } from "react-router-dom";
import { Torch } from "../../components/ui.jsx";
import { usePublicStats } from "../../lib/publicStats.js";
import { STATES } from "../../data/states.js";
import { DEPARTMENTS, formatTime12 } from "../../lib/shared.js";
import { FAQ } from "./faq.js";

export default function Home() {
  const { data } = usePublicStats();
  const site = data?.site || {};

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div>
            <p className="hero-mark">The Torch of Deborah</p>
            <h1>
              <span>Arise.</span>
              <span>Pray.</span>
              <span>Mobilise.</span>
              <span>Impact Nigeria.</span>
            </h1>
            <p className="hero-lede">
              A generation of women rising to stand in the gap for Nigeria. Ten thousand of us, praying together every day for six months.
            </p>
            <div className="hero-actions">
              <Link to="/join" className="btn btn-gold">Join the movement</Link>
              <Link to="/about" className="btn btn-ghost">Learn about the movement</Link>
            </div>
          </div>
          <Torch className="hero-emblem" />
        </div>
      </section>

      <section className="section" id="about">
        <div className="wrap split">
          <div>
            <h2 className="h2">Women who arise change the story of a nation.</h2>
          </div>
          <div className="prose">
            <p>
              The Torch of Deborah is a movement mobilising 10,000 women to arise as Deborahs, stand in the place of prayer and become vessels of transformation in Nigeria.
            </p>
            <p>
              We believe the future of a nation is worth praying for. So we are calling women across Nigeria and beyond to pray together daily for six months, raise a generation of spiritual watchmen and take an active part in God's purpose for our nation.
            </p>
            <blockquote className="scripture" style={{ marginTop: 36 }}>
              <p>The inhabitants of the villages ceased, they ceased in Israel, until that I Deborah arose, that I arose a mother in Israel.</p>
              <cite>Judges 5:7 (KJV)</cite>
            </blockquote>
          </div>
        </div>
      </section>

      <section className="section" id="mission">
        <div className="wrap">
          <h2 className="h2">What we are here to do</h2>
          <ul className="objectives">
            <li><strong>Pray daily, together</strong><span>One hour each day, every day, for six months, with women across every state.</span></li>
            <li><strong>Stand in the gap</strong><span>Intercede for Nigeria's leaders, families, communities, economy and peace.</span></li>
            <li><strong>Raise watchmen</strong><span>Build a generation of praying women who carry the burden of the nation beyond these six months.</span></li>
            <li><strong>Gather in small hubs</strong><span>About 20 women in each prayer hub, led by a hub leader who knows them by name.</span></li>
            <li><strong>Mobilise others</strong><span>Each woman invites others, until every local government area has women on the wall.</span></li>
            <li><strong>Act on what we pray</strong><span>Prayer that moves us to serve our communities and impact Nigeria in practical ways.</span></li>
          </ul>
        </div>
      </section>

      <section className="section section-dark" id="six-months">
        <div className="wrap">
          <div className="split">
            <h2 className="h2">Six months. One hour a day. One nation.</h2>
            <div>
              <p className="lede">
                Every day we gather online to pray with one voice, then carry that prayer into our hubs and homes.
                {site.dailyTime ? ` We meet at ${formatTime12(site.dailyTime)} Nigeria time.` : ""}
                {" "}If you cannot join the live meeting, you pray at the same hour wherever you are.
              </p>
            </div>
          </div>
          <div className="facts">
            <div><b>10,000</b><span>women praying for Nigeria</span></div>
            <div><b>500</b><span>prayer hubs, each led by a hub leader</span></div>
            <div><b>37</b><span>36 states and the FCT, with sisters abroad</span></div>
            <div><b>180</b><span>days of unbroken daily prayer</span></div>
          </div>
        </div>
      </section>

      <section className="section" id="vision">
        <div className="wrap">
          <div className="split">
            <h2 className="h2">The torch passes through every state.</h2>
            <p className="lede">
              Our vision is women praying in every state and local government area of Nigeria, joined by Nigerian women abroad.
            </p>
          </div>
          <div className="roll">
            {STATES.map((s) => (
              <div key={s.code} className="roll-item">
                <span className="roll-name">{s.code === "FC" ? "FCT" : s.name}</span>
              </div>
            ))}
          </div>
          <p className="roll-legend"><Link to="/join">Register and carry the torch in your state.</Link></p>
        </div>
      </section>

      <section className="section" id="participate">
        <div className="wrap">
          <h2 className="h2">How to take part</h2>
          <ol className="steps">
            <li><b>Register</b><span>Fill a short form on your phone. It takes about three minutes.</span></li>
            <li><b>Meet your hub</b><span>We place you in a prayer hub in your state and introduce your hub leader.</span></li>
            <li><b>Join the groups</b><span>Tap to join your hub's WhatsApp group and our central Telegram community.</span></li>
            <li><b>Pray every day</b><span>Join the daily prayer meeting on Zoom, or pray at the same hour where you are.</span></li>
          </ol>
          <div style={{ marginTop: 40 }}>
            <Link to="/join" className="btn btn-primary">Register now</Link>
          </div>
        </div>
      </section>

      <section className="section section-wine" id="volunteer">
        <div className="wrap split">
          <h2 className="h2">Serve the movement behind the scenes.</h2>
          <div>
            <p style={{ fontSize: 18, maxWidth: "34em", margin: 0 }}>
              A movement of 10,000 needs women and men who mobilise, communicate, coordinate prayer and support each state. Give a few hours a week.
            </p>
            <ul className="depts">{DEPARTMENTS.map((d) => <li key={d}>{d}</li>)}</ul>
            <Link to="/volunteer" className="btn btn-gold">See volunteer roles</Link>
          </div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="wrap split">
          <h2 className="h2">Questions women ask</h2>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-dark final-cta">
        <div className="wrap">
          <h2 className="h2">Will you answer the call?</h2>
          <p className="lede" style={{ marginBottom: 32 }}>Register today and be placed in a prayer hub with women from your state.</p>
          <Link to="/join" className="btn btn-gold">Join the movement</Link>
        </div>
      </section>
    </>
  );
}
