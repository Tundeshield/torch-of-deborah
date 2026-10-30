// Public, non-personal movement numbers for the website. Cached at the edge for 5 minutes.
import { db, handler } from "./_lib/core.js";
import { DEFAULT_SETTINGS } from "../../src/lib/shared.js";

export default handler(async () => {
  const [states, site] = await Promise.all([db().collection("states").get(), db().doc("public/site").get()]);
  const byState = {};
  const extraLgas = {};
  let total = 0;
  states.forEach((d) => {
    const n = Math.max(0, d.data().counts?.registrations || 0);
    byState[d.id] = n;
    total += n;
    if (d.data().extraLgas?.length) extraLgas[d.id] = d.data().extraLgas;
  });
  const s = site.exists ? site.data() : {};
  return new Response(JSON.stringify({ total, byState, extraLgas, site: { ...pick(DEFAULT_SETTINGS), ...s } }), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=60, s-maxage=300" },
  });
});

function pick(d) {
  const { programmeName, registrationOpen, registrationTarget, startDate, durationMonths, dailyTime, durationMinutes, timezone } = d;
  return { programmeName, registrationOpen, registrationTarget, startDate, durationMonths, dailyTime, durationMinutes, timezone };
}
