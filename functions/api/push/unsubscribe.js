import { json, readJson } from "../../lib/http.js";
import { requireMinifluxUser } from "../../lib/auth.js";
import {
  readSubscriptions,
  removeSubscription,
  writeSubscriptions,
} from "../../lib/subscriptions.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireMinifluxUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

  const body = await readJson(request);
  if (!body || typeof body.endpoint !== "string") {
    return json({ error: "missing_endpoint" }, { status: 400 });
  }

  const current = await readSubscriptions(env);
  const next = removeSubscription(current, body.endpoint);
  if (next.length !== current.length) await writeSubscriptions(env, next);

  return json({ ok: true, subscriptions: next.length });
}
