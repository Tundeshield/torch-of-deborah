// Public settings for the website. On first use it also makes sure this site's address is allowed
// for Google sign-in in Firebase, so nobody has to set that by hand.
import { app, handler, getSettings } from "./_lib/core.js";

let domainsChecked = false;

async function ensureAuthorisedDomains() {
  if (domainsChecked || globalThis.__TOD_DB) return;
  domainsChecked = true;
  try {
    const hosts = [process.env.SITE_URL, process.env.URL].filter(Boolean).map((u) => new URL(u).host);
    if (!hosts.length) return;
    const project = app().options.projectId;
    const token = (await app().options.credential.getAccessToken()).access_token;
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", "x-goog-user-project": project };
    const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
    const cfg = await (await fetch(base, { headers })).json();
    const current = cfg.authorizedDomains || [];
    const missing = hosts.filter((h) => !current.includes(h));
    if (!missing.length) return;
    const res = await fetch(`${base}?updateMask=authorizedDomains`, { method: "PATCH", headers, body: JSON.stringify({ authorizedDomains: [...current, ...missing] }) });
    if (!res.ok) {
      domainsChecked = false;
      console.error("Could not add authorised domain", res.status, await res.text());
    }
  } catch (e) {
    domainsChecked = false;
    console.error(e);
  }
}

export default handler(async () => {
  await ensureAuthorisedDomains();
  const s = await getSettings();
  const site = { registrationOpen: s.registrationOpen, dailyTime: s.dailyTime, startDate: s.startDate, contactEmail: s.contactEmail, contactPhone: s.contactPhone };
  return new Response(JSON.stringify({ site }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } });
});
