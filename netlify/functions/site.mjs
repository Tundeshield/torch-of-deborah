// Public, non-personal settings for the website (prayer time, contact, whether registration is open).
import { handler, getSettings } from "./_lib/core.js";

export default handler(async () => {
  const s = await getSettings();
  const site = { registrationOpen: s.registrationOpen, dailyTime: s.dailyTime, startDate: s.startDate, contactEmail: s.contactEmail, contactPhone: s.contactPhone };
  return new Response(JSON.stringify({ site }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=60, s-maxage=120" } });
});
