// Miniflux signs webhook bodies with HMAC-SHA256 and sends the lowercase hex
// digest in X-Miniflux-Signature (https://miniflux.app/docs/webhooks.html).

const encoder = new TextEncoder();

export function toHex(bytes) {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

export async function signBody(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return toHex(new Uint8Array(signature));
}

export function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function verifyMinifluxSignature(secret, body, signature) {
  if (!secret || typeof signature !== "string") return false;
  const provided = signature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  return timingSafeEqual(await signBody(secret, body), provided);
}
