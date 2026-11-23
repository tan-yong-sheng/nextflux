// Subscribing is only useful to the owner of the Miniflux instance, so the
// Pages Functions reuse the credentials the app already sends to Miniflux
// instead of inventing a second secret. Any valid Miniflux credentials pass.

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
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/me`, { headers });
  } catch {
    return { ok: false, status: 502, error: "miniflux_unreachable" };
  }
  if (!response.ok) return { ok: false, status: 401, error: "invalid_credentials" };

  return { ok: true, user: await response.json().catch(() => null) };
}
