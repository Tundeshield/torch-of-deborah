// Scheduled (see netlify.toml): sends announcements whose scheduled time has passed.
import { db, Timestamp } from "./_lib/core.js";
import { dispatchAnnouncement } from "./_lib/dispatch.js";

export default async () => {
  try {
    const due = await db()
      .collection("announcements")
      .where("status", "==", "scheduled")
      .where("scheduledAt", "<=", Timestamp.now())
      .limit(10)
      .get();
    const site = (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");
    for (const d of due.docs) await dispatchAnnouncement(d.id, site);
    return new Response(JSON.stringify({ dispatched: due.size }));
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
};
