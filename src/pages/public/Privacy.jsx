import { usePublicStats } from "../../lib/publicStats.js";

export default function Privacy() {
  const site = usePublicStats().data?.site || {};
  return (
    <>
      <div className="page-head">
        <div className="narrow">
          <h1>Privacy policy</h1>
          <p>How The Torch of Deborah collects, uses and protects your information.</p>
        </div>
      </div>
      <section className="section">
        <div className="narrow prose">
          <h2 className="h3">What we collect</h2>
          <p>When you register we collect your name, WhatsApp number, email address, state, local government area (or country and city), how you would like to take part, what inspired you to join and, if you choose, your church or ministry. We also record your prayer hub, whether you have joined your hub's group and participation that you or your hub leader report.</p>
          <h2 className="h3" style={{ marginTop: 32 }}>Why we collect it</h2>
          <p>To place you in a prayer hub, connect you with your hub leader and state coordinator, send you the prayer schedule, meeting links and announcements, and understand how the movement is growing. We process your information on the basis of the consent you give when you register, in line with the Nigeria Data Protection Act 2023.</p>
          <h2 className="h3" style={{ marginTop: 32 }}>Who can see it</h2>
          <p>Your hub leader sees the members of their own hub. Your state coordinator sees registrations in your state. A small national administration team sees all registrations. Access is controlled by role and every administrative change is recorded. We never sell your information or share it with advertisers.</p>
          <p>We use trusted service providers to run the platform: Google Firebase to store data and Netlify to host the website, and an email delivery service to send messages. WhatsApp, Telegram and Zoom are separate services with their own privacy policies.</p>
          <h2 className="h3" style={{ marginTop: 32 }}>How long we keep it</h2>
          <p>We keep your information for the six-month programme and up to twelve months afterwards so we can follow up and plan future gatherings. After that we delete it or keep only anonymous totals.</p>
          <h2 className="h3" style={{ marginTop: 32 }}>Your choices</h2>
          <p>You can ask us to correct your details, stop sending you messages or delete your registration at any time{site.contactEmail ? <> by writing to <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></> : " by contacting the national team"}. Your welcome page link is personal; please keep it private.</p>
          <p className="small muted" style={{ marginTop: 32 }}>Last updated October 2026.</p>
        </div>
      </section>
    </>
  );
}
