import { useEffect, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase.js";
import { useLiveQuery } from "../../lib/hooks.js";
import { useHubs, useSettings, Head } from "./common.jsx";
import { capacityOf, waLink } from "../../lib/shared.js";
import { Empty, ErrorText, Field, Loading, useAction } from "../../components/ui.jsx";
import { api } from "../../lib/api.js";

// The hub leader's whole dashboard: her members and her group link.
export default function MyHub() {
  const hubs = useHubs();
  const settings = useSettings().data;
  const [hubId, setHubId] = useState("");
  useEffect(() => {
    if (!hubId && hubs.data.length) setHubId(hubs.data[0].id);
  }, [hubs.data, hubId]);
  const hub = hubs.data.find((h) => h.id === hubId);
  const members = useLiveQuery(() => (hubId ? query(collection(db, "participants"), where("hubId", "==", hubId)) : null), [hubId]);

  if (hubs.loading) return <Loading />;
  if (!hub) return <Empty title="You don't have a hub yet">Your state coordinator will assign you to one.</Empty>;
  const list = [...members.data].sort((a, b) => a.fullName.localeCompare(b.fullName));

  return (
    <div style={{ maxWidth: 760 }}>
      <Head title={hub.name} sub={`${list.length} of ${capacityOf(hub, settings)} members`}>
        {hubs.data.length > 1 && (
          <select className="input" value={hubId} onChange={(e) => setHubId(e.target.value)} aria-label="Choose hub" style={{ width: "auto" }}>
            {hubs.data.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        )}
      </Head>
      <GroupLink hub={hub} />
      <ErrorText error={members.error} />
      {list.length === 0 ? (
        <Empty title="No members yet">New women in your state are added here automatically.</Empty>
      ) : (
        <table className="table">
          <thead><tr><th>Member</th><th className="hide-sm">Area</th><th /></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id}>
                <td>{m.fullName}<div className="sub">{m.phone}</div></td>
                <td className="hide-sm">{m.lga}</td>
                <td style={{ textAlign: "right" }}>
                  <a className="btn whatsapp sm" target="_blank" rel="noopener" href={waLink(m.phone, `Hello ${m.fullName.split(" ")[0]}, welcome to ${hub.name}! I'm your hub leader.${hub.whatsappLink ? ` Join our group here: ${hub.whatsappLink}` : ""}`)}>Message</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GroupLink({ hub }) {
  const [editing, setEditing] = useState(!hub.whatsappLink);
  const [link, setLink] = useState(hub.whatsappLink || "");
  const [run, busy] = useAction();
  useEffect(() => {
    setLink(hub.whatsappLink || "");
    setEditing(!hub.whatsappLink);
  }, [hub.id, hub.whatsappLink]);

  if (!editing) {
    return (
      <p className="small muted" style={{ margin: "-8px 0 24px" }}>
        WhatsApp group link is set. <button className="link" onClick={() => setEditing(true)}>Change</button>
      </p>
    );
  }
  return (
    <div className="note" style={{ marginBottom: 24 }}>
      <Field label="Your WhatsApp group link" id="gl" hint="New members see it as soon as they register. In WhatsApp: group info → Invite via link → Copy.">
        <input id="gl" className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://chat.whatsapp.com/…" />
      </Field>
      <button className="btn sm" disabled={busy || !link} onClick={() => run(() => api.admin("updateHubLink", { hubId: hub.id, whatsappLink: link }), "Link saved.").then(() => setEditing(false)).catch(() => {})}>Save link</button>
    </div>
  );
}
