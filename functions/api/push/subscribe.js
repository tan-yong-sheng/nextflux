import { json, readJson } from "../../lib/http.js";
import { requireMinifluxUser } from "../../lib/auth.js";
import {
  normalizeSubscription,
  saveSubscription,
} from "../../lib/subscriptions.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireMinifluxUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

  const subscription = normalizeSubscription(await readJson(request));
  if (!subscription) return json({ error: "invalid_subscription" }, { status: 400 });

  await saveSubscription(env, auth.user.id, subscription);

  return json({ ok: true });
}
