import { db, FieldValue, queueMail, emailLayout, button } from "./core.js";
import { matchesStaff } from "./audience.js";
import { escapeHtml } from "../../../src/lib/shared.js";

const ACTIVE = ["assigned", "unassigned"];

async function participantEmails(audience) {
  const col = db().collection("participants");
  const emails = new Set();
  const add = (snap) => snap.forEach((d) => {
    const x = d.data();
    if (ACTIVE.includes(x.status) && x.email) emails.add(x.email);
  });
  if (audience.type === "all" || (audience.type === "roles" && (audience.roles || []).includes("participant"))) {
    add(await col.select("email", "status").get());
  } else if (audience.type === "states") {
    for (let i = 0; i < (audience.stateCodes || []).length; i += 10) {
      add(await col.where("stateCode", "in", audience.stateCodes.slice(i, i + 10)).select("email", "status").get());
    }
  } else if (audience.type === "hubs") {
    for (let i = 0; i < (audience.hubIds || []).length; i += 10) {
      add(await col.where("hubId", "in", audience.hubIds.slice(i, i + 10)).select("email", "status").get());
    }
  }
  return emails;
}

async function staffEmails(audience) {
  const snap = await db().collection("users").where("active", "==", true).get();
  const out = new Set();
  snap.forEach((d) => {
    const u = d.data();
    if (u.email && matchesStaff(audience, u)) out.add(u.email);
  });
  return out;
}

export async function dispatchAnnouncement(id, siteUrl) {
  const ref = db().doc(`announcements/${id}`);
  const claimed = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const a = s.data();
    if (!["scheduled", "sending_requested"].includes(a.status)) return null;
    tx.update(ref, { status: "sending" });
    return a;
  });
  if (!claimed) return { skipped: true };
  const a = claimed;
  let recipients = 0;
  let mailDocs = 0;
  try {
    if ((a.channels || []).includes("email")) {
      const set = await participantEmails(a.audience || {});
      for (const e of await staffEmails(a.audience || {})) set.add(e);
      const list = [...set];
      recipients = list.length;
      const html = emailLayout(a.title, `${String(a.body || "").split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("")}${a.linkUrl ? button(a.linkUrl, a.linkLabel || "Open") : ""}<p style="font-size:13px;color:#6b5f52">You receive this because you joined The Torch of Deborah. Your welcome page has all your links: ${escapeHtml(siteUrl)}</p>`);
      const from = process.env.MAIL_BULK_TO || null;
      for (let i = 0; i < list.length; i += 450) {
        const batch = db().batch();
        for (let j = i; j < Math.min(i + 450, list.length); j += 50) {
          const chunk = list.slice(j, j + 50);
          queueMail(batch, { to: from || chunk[0], bcc: from ? chunk : chunk.slice(1), subject: a.title, html, meta: { kind: "announcement", announcementId: id } });
          mailDocs++;
        }
        await batch.commit();
      }
    }
    await ref.update({ status: "sent", sentAt: FieldValue.serverTimestamp(), recipientCount: recipients, mailDocs });
    return { sent: true, recipients };
  } catch (err) {
    console.error(err);
    await ref.update({ status: "failed", error: String(err.message || err).slice(0, 300) });
    return { failed: true };
  }
}
