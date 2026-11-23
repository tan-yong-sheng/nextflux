/**
 * Stable, filesystem-safe key for a Miniflux account.
 *
 * The key is derived from the account id (`serverUrl + userId`) so it never
 * leaks the server URL, and it stays the same across sessions and devices.
 */

const KEY_LENGTH = 12;

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * @param {string} accountId
 * @returns {Promise<string>} 12 characters of base64url(sha256(accountId))
 */
export async function accountBackupKey(accountId) {
  const input = String(accountId ?? "");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return toBase64Url(new Uint8Array(digest)).slice(0, KEY_LENGTH);
}
