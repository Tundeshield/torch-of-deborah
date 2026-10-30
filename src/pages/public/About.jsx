import { Link } from "react-router-dom";

export default function About() {
  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <h1>About the movement</h1>
          <p>Why 10,000 women are gathering every day for six months to pray for Nigeria.</p>
        </div>
      </div>
      <section className="section">
        <div className="wrap split">
          <h2 className="h2">A mother in Israel. Daughters in Nigeria.</h2>
          <div className="prose">
            <p>
              In the book of Judges, Deborah rose at a time when the roads were empty and the people were afraid. She was a prophetess, a judge and a mother in Israel. She heard from God, called others to act, and went with them.
            </p>
            <p>
              The Torch of Deborah calls women to that same posture: to arise, to pray with conviction and to mobilise others. We believe that when women stand in the gap together, a nation's story can change.
            </p>
            <blockquote className="scripture" style={{ marginTop: 32 }}>
              <p>Awake, awake, Deborah: awake, awake, utter a song.</p>
              <cite>Judges 5:12 (KJV)</cite>
            </blockquote>
          </div>
        </div>
      </section>
      <section className="section" id="mission">
        <div className="wrap split">
          <h2 className="h2">Our mission</h2>
          <div className="prose">
            <p>
              To raise 10,000 women who will gather daily in unity to pray for Nigeria for six months, organised in 500 prayer hubs across all 36 states, the Federal Capital Territory and the diaspora.
            </p>
            <p>
              Each hub of about 20 women is led by a hub leader and supported by a state coordinator. Every day we pray together online, and through the week our hubs encourage one another, follow up with those who fall behind and invite more women in.
            </p>
            <p>
              We are not a denomination and we do not replace your local church. We are women from many churches and ministries, united by one burden: Nigeria.
            </p>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap split">
          <h2 className="h2">How the movement is organised</h2>
          <ul className="objectives" style={{ gridTemplateColumns: "1fr" }}>
            <li><strong>National team</strong><span>Sets the prayer schedule and themes, appoints state coordinators and keeps the whole movement moving together.</span></li>
            <li><strong>State coordinators</strong><span>Oversee the prayer hubs in their state, appoint hub leaders and make sure no woman is left without a hub.</span></li>
            <li><strong>Hub leaders</strong><span>Shepherd about 20 women each: welcoming them, praying with them and following up when someone goes quiet.</span></li>
            <li><strong>Volunteers</strong><span>Mobilise, communicate, coordinate prayer and support administration and technology.</span></li>
          </ul>
        </div>
      </section>
      <section className="section section-dark">
        <div className="wrap">
          <h2 className="h2">Take your place.</h2>
          <div className="hero-actions">
            <Link to="/join" className="btn btn-gold">Join the movement</Link>
            <Link to="/volunteer" className="btn btn-ghost">Volunteer</Link>
          </div>
        </div>
      </section>
    </>
  );
}
