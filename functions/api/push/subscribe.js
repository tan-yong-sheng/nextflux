import { json, readJson } from "../../lib/http.js";
import { requireMinifluxUser } from "../../lib/auth.js";
import {
  normalizeHiddenFeedIds,
  normalizeSubscription,
  saveSubscription,
} from "../../lib/subscriptions.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireMinifluxUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

  const body = await readJson(request);
  const subscription = normalizeSubscription(body);
  if (!subscription) return json({ error: "invalid_subscription" }, { status: 400 });

  await saveSubscription(
    env,
    auth.user.id,
    subscription,
    normalizeHiddenFeedIds(body.hiddenFeedIds),
  );

  return json({ ok: true });
}
