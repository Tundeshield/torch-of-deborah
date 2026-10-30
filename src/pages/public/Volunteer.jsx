import { Link } from "react-router-dom";

const ROLES = [
  { name: "Mobilisation", text: "Spread the word in churches, fellowships and communities, and help women register." },
  { name: "Communications", text: "Create graphics, write updates, manage social media and keep the movement's voice clear." },
  { name: "Prayer Coordination", text: "Prepare daily prayer points, support meeting hosts and keep the prayer focus aligned." },
  { name: "Administration", text: "Keep records accurate, help place women in hubs and support the national team." },
  { name: "State Operations", text: "Work alongside a state coordinator to set up hubs and support hub leaders." },
  { name: "Technical Support", text: "Help women and leaders with Zoom, WhatsApp, Telegram and this platform." },
];

export default function Volunteer() {
  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <h1>Volunteer with us</h1>
          <p>Give a few hours each week to help 10,000 women pray for Nigeria.</p>
        </div>
      </div>
      <section className="section">
        <div className="wrap">
          <ul className="objectives">
            {ROLES.map((r) => <li key={r.name}><strong>{r.name}</strong><span>{r.text}</span></li>)}
          </ul>
          <div className="hero-actions" style={{ marginTop: 44 }}>
            <Link to="/join?as=General%20Volunteer" className="btn btn-primary">Register as a volunteer</Link>
            <Link to="/join?as=Mobilisation%20Volunteer" className="btn btn-quiet">Register as a mobilisation volunteer</Link>
            <Link to="/join?as=Leadership" className="btn btn-quiet">I would like to lead a hub</Link>
          </div>
          <p className="muted" style={{ marginTop: 18, maxWidth: "40em" }}>
            Volunteers register like every participant and are also placed in a prayer hub. The national team will contact you about a department.
          </p>
        </div>
      </section>
    </>
  );
}
