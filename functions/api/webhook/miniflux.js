import { json } from "../../lib/http.js";
import { buildNewEntriesNotice } from "../../lib/notice.js";
import { deliverPush } from "../../lib/push.js";
import { verifyMinifluxSignature } from "../../lib/signature.js";
import { readSubscriptions, writeSubscriptions } from "../../lib/subscriptions.js";

export async function onRequestPost({ request, env }) {
  const secret = env.MINIFLUX_WEBHOOK_SECRET;
  if (!secret) return json({ error: "webhook_secret_not_configured" }, { status: 500 });

  const body = await request.text();
  const signature = request.headers.get("x-miniflux-signature");
  if (!(await verifyMinifluxSignature(secret, body, signature))) {
    return json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const notice = buildNewEntriesNotice(payload);
  if (!notice) return json({ ok: true, sent: 0 });

  const subscriptions = await readSubscriptions(env);
  if (subscriptions.length === 0) return json({ ok: true, sent: 0 });

  const results = await Promise.all(
    subscriptions.map(async (subscription) => ({
      subscription,
      outcome: await deliverPush(env, subscription, notice),
    })),
  );

  const alive = results.filter(({ outcome }) => outcome !== "gone").map(({ subscription }) => subscription);
  if (alive.length !== subscriptions.length) await writeSubscriptions(env, alive);

  const sent = results.filter(({ outcome }) => outcome === "sent").length;
  return json({
    ok: true,
    articles: notice.count,
    sent,
    pruned: subscriptions.length - alive.length,
  });
}
