// Subscribing is only useful to the owner of the Miniflux instance, so the
// Pages Functions reuse the credentials the app already sends to Miniflux
// instead of inventing a second secret. Only the instance's admin user may
// register devices; the webhook then fans out to that user's devices only.

const TIMEOUT_MS = 5000;

export async function requireMinifluxUser(request, env) {
  const baseUrl = env.MINIFLUX_URL;
  if (!baseUrl) return { ok: false, status: 500, error: "miniflux_url_not_configured" };

  const headers = {};
  const token = request.headers.get("x-auth-token");
  const authorization = request.headers.get("authorization");
  if (token) headers["X-Auth-Token"] = token;
  else if (authorization) headers.Authorization = authorization;
  else return { ok: false, status: 401, error: "missing_credentials" };

  let response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/me`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 502, error: "miniflux_unreachable" };
  }
  if (!response.ok) {
    const unauthorized = response.status === 401 || response.status === 403;
    return {
      ok: false,
      status: unauthorized ? 401 : 502,
      error: unauthorized ? "invalid_credentials" : "miniflux_unreachable",
    };
  }

  const user = await response.json().catch(() => null);
  if (!user?.is_admin) return { ok: false, status: 403, error: "not_instance_owner" };
  return { ok: true, user };
}
