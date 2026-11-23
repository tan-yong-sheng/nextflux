import { json } from "../../lib/http.js";
import { buildNewEntriesNotice } from "../../lib/notice.js";
import { deliverPush } from "../../lib/push.js";
import { verifyMinifluxSignature } from "../../lib/signature.js";
import { listSubscriptions, pruneSubscriptions } from "../../lib/subscriptions.js";

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

  // Subscriptions are stored per Miniflux user, so the webhook only reaches
  // the devices of the user whose feed refreshed.
  const userId = payload?.feed?.user_id;
  if (userId === undefined || userId === null) {
    return json({ error: "missing_user_id" }, { status: 400 });
  }

  const subscriptions = await listSubscriptions(env, userId);
  if (subscriptions.length === 0) return json({ ok: true, sent: 0 });

  const results = await Promise.all(
    subscriptions.map(async (subscription) => ({
      subscription,
      outcome: await deliverPush(env, subscription, notice),
    })),
  );

  const gone = results
    .filter(({ outcome }) => outcome === "gone")
    .map(({ subscription }) => subscription.endpoint);
  if (gone.length) await pruneSubscriptions(env, userId, gone);

  const sent = results.filter(({ outcome }) => outcome === "sent").length;
  const failed = results.filter(({ outcome }) => outcome.startsWith("failed")).length;
  if (failed) {
    console.error("web_push_delivery_failed", { userId, sent, failed, pruned: gone.length });
  }

  // Miniflux does not retry webhook deliveries, so a total failure is
  // surfaced as an error instead of being acknowledged silently.
  if (sent === 0 && failed > 0) {
    return json(
      { ok: false, error: "push_delivery_failed", articles: notice.count, sent, failed, pruned: gone.length },
      { status: 502 },
    );
  }

  return json({
    ok: true,
    articles: notice.count,
    sent,
    failed,
    pruned: gone.length,
  });
}
