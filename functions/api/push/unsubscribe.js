import { json, readJson } from "../../lib/http.js";
import { requireMinifluxUser } from "../../lib/auth.js";
import { deleteSubscription } from "../../lib/subscriptions.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireMinifluxUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

  const body = await readJson(request);
  if (!body || typeof body.endpoint !== "string") {
    return json({ error: "missing_endpoint" }, { status: 400 });
  }

  await deleteSubscription(env, auth.user.id, body.endpoint);

  return json({ ok: true });
}
