/**
 * Stable, filesystem-safe key for a Miniflux account.
 *
 * The key is derived from the account id (`accountId(auth)`: a JSON pair of the
 * normalized server URL and the user id) so it never leaks the server URL, and
 * it stays the same across sessions and devices.
 */

const KEY_LENGTH = 12;

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * Plain SHA-256 for non-secure contexts, where `crypto.subtle` is absent.
 *
 * The key only needs to be stable, not secret, so this small digest is enough
 * for plain-HTTP deployments. It is verified against Web Crypto in the tests.
 */
function sha256Fallback(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const length = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(length);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(length - 8, Math.floor((bytes.length * 8) / 0x100000000));
  view.setUint32(length - 4, (bytes.length * 8) >>> 0);

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const first = schedule[index - 15];
      const second = schedule[index - 2];
      const s0 = rotr(first, 7) ^ rotr(first, 18) ^ (first >>> 3);
      const s1 = rotr(second, 17) ^ rotr(second, 19) ^ (second >>> 10);
      schedule[index] =
        (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }

    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (let index = 0; index < 64; index += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + SHA256_K[index] + schedule[index]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] += a;
    hash[1] += b;
    hash[2] += c;
    hash[3] += d;
    hash[4] += e;
    hash[5] += f;
    hash[6] += g;
    hash[7] += h;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let index = 0; index < 8; index += 1) {
    digestView.setUint32(index * 4, hash[index]);
  }
  return digest;
}

async function sha256(bytes) {
  if (globalThis.crypto?.subtle) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  }
  return sha256Fallback(bytes);
}

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
  const digest = await sha256(new TextEncoder().encode(input));
  return toBase64Url(digest).slice(0, KEY_LENGTH);
}