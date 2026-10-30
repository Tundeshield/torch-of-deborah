import { Link } from "react-router-dom";
import { usePublicStats } from "../../lib/publicStats.js";

export default function Contact() {
  const site = usePublicStats().data?.site || {};
  return (
    <>
      <div className="page-head">
        <div className="wrap">
          <h1>Contact us</h1>
          <p>Questions about registering, your prayer hub or serving with us.</p>
        </div>
      </div>
      <section className="section">
        <div className="wrap split">
          <div className="prose">
            <p>If you have registered, your welcome page shows your hub leader and state coordinator. They are the quickest people to help you.</p>
            <p><Link to="/welcome">Find my prayer hub</Link></p>
          </div>
          <dl className="kv" style={{ fontSize: 18 }}>
            {site.contactEmail && <><dt>Email</dt><dd><a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></dd></>}
            {site.contactPhone && <><dt>Phone / WhatsApp</dt><dd><a href={`tel:${site.contactPhone}`}>{site.contactPhone}</a></dd></>}
            {site.instagram && <><dt>Instagram</dt><dd><a href={site.instagram} target="_blank" rel="noopener">Follow us</a></dd></>}
            {site.facebook && <><dt>Facebook</dt><dd><a href={site.facebook} target="_blank" rel="noopener">Follow us</a></dd></>}
            {!site.contactEmail && !site.contactPhone && <><dt>Contact</dt><dd>Contact details will be published here shortly.</dd></>}
          </dl>
        </div>
      </section>
    </>
  );
}
