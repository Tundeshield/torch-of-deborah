import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loading } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";
import { getHubKey, clearHubKey } from "../../lib/device.js";
import { useSite } from "../../components/PublicLayout.jsx";
import { waLink } from "../../lib/shared.js";
import HubResult from "./HubResult.jsx";

export default function MyHubPublic() {
  const key = getHubKey();
  const site = useSite();
  const [state, setState] = useState({ loading: Boolean(key), info: null });

  useEffect(() => {
    if (!key) return;
    api.myHub(key)
      .then((info) => setState({ loading: false, info }))
      .catch((e) => {
        if (e.status === 404) clearHubKey();
        setState({ loading: false, info: null });
      });
  }, [key]);

  if (state.loading) return <Loading />;
  if (state.info) return <div className="page"><div className="narrow"><HubResult info={state.info} title={`Hello, ${state.info.firstName}`} /></div></div>;

  return (
    <div className="page">
      <div className="narrow">
        <h1>My hub</h1>
        <p className="muted">Your hub shows here on the phone you registered with.</p>
        <p>On another phone, or can't find it? Your hub leader will message you on WhatsApp with your group link.{site.contactPhone && <> If you haven't heard from them, <a href={waLink(site.contactPhone)} target="_blank" rel="noopener">message the national team</a>.</>}</p>
        <p style={{ marginTop: 28 }}>Not registered yet? <Link to="/join">Join the movement</Link></p>
      </div>
    </div>
  );
}
