import { buildPushPayload } from "@block65/webcrypto-web-push";

const TTL_SECONDS = 60 * 60;

export function vapidKeys(env) {
  return {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
}

export async function buildPushRequest(subscription, notice, env) {
  const payload = await buildPushPayload(
    { data: notice, options: { ttl: TTL_SECONDS, urgency: "normal" } },
    subscription,
    vapidKeys(env),
  );
  return {
    endpoint: subscription.endpoint,
    init: { method: payload.method, headers: payload.headers, body: payload.body },
  };
}

// RFC 8030: 404 and 410 mean the subscription is gone for good, everything
// else (including 429) is worth retrying on the next webhook.
export async function deliverPush(env, subscription, notice) {
  let request;
  try {
    request = await buildPushRequest(subscription, notice, env);
  } catch {
    return "failed:encrypt";
  }

  try {
    const response = await fetch(request.endpoint, request.init);
    if (response.ok) return "sent";
    if (response.status === 404 || response.status === 410) return "gone";
    return `failed:${response.status}`;
  } catch {
    return "failed:network";
  }
}
