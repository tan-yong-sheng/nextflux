import { json } from "../../lib/http.js";

// The public key is public by definition; serving it keeps the client free of
// build-time configuration.
export function onRequestGet({ env }) {
  if (!env.VAPID_PUBLIC_KEY) return json({ error: "vapid_not_configured" }, { status: 500 });
  return json(
    { key: env.VAPID_PUBLIC_KEY },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
