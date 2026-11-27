import { json } from "../../lib/http.js";
import { buildNewEntriesNotice } from "../../lib/notice.js";
import { deliverPush } from "../../lib/push.js";
import { verifyMinifluxSignature } from "../../lib/signature.js";
import { listSubscriptionsForDelivery, pruneSubscriptions } from "../../lib/subscriptions.js";

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

  const subscriptions = await listSubscriptionsForDelivery(env, userId);
  if (subscriptions.length === 0) return json({ ok: true, sent: 0 });

  // Every device reports the feeds it hides globally, so the notice for that
  // device leaves the entries of those feeds out.
  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      const deviceNotice = buildNewEntriesNotice(payload, {
        hiddenFeedIds: subscription.hiddenFeedIds ?? [],
      });
      // Every entry of this refresh is from a feed the device hides, so this
      // device stays silent.
      if (!deviceNotice) return { subscription, outcome: "skipped" };
      return {
        subscription,
        outcome: await deliverPush(env, subscription, deviceNotice),
      };
    }),
  );

  const gone = results
    .filter(({ outcome }) => outcome === "gone")
    .map(({ subscription }) => subscription.endpoint);
  if (gone.length) await pruneSubscriptions(env, userId, gone);

  const sent = results.filter(({ outcome }) => outcome === "sent").length;
  const failures = results.filter(({ outcome }) => outcome.startsWith("failed"));
  const failed = failures.length;
  if (failed) {
    // Keep the distinct causes: encrypt, push (with its status) and network
    // failures point at different problems.
    const reasons = {};
    for (const { outcome } of failures) reasons[outcome] = (reasons[outcome] ?? 0) + 1;
    console.error("web_push_delivery_failed", { userId, sent, failed, reasons, pruned: gone.length });
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
