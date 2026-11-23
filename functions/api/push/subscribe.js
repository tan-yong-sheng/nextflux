import { json, readJson } from "../../lib/http.js";
import { requireMinifluxUser } from "../../lib/auth.js";
import {
  normalizeSubscription,
  readSubscriptions,
  upsertSubscription,
  writeSubscriptions,
} from "../../lib/subscriptions.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireMinifluxUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

  const subscription = normalizeSubscription(await readJson(request));
  if (!subscription) return json({ error: "invalid_subscription" }, { status: 400 });

  const current = await readSubscriptions(env);
  const next = upsertSubscription(current, subscription);
  await writeSubscriptions(env, next);

  return json({ ok: true, subscriptions: next.length });
}
