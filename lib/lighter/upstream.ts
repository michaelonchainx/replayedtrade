/** Server-only helpers for the Lighter proxy routes. Never logs addresses or tokens. */
export const LIGHTER_BASE = 'https://mainnet.zklighter.elliot.ai/api/v1';

export async function lighterGet(path: string, params: Record<string, string | number>, auth?: string | null): Promise<Response> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (auth) headers.authorization = auth;
  try {
    const res = await fetch(`${LIGHTER_BASE}/${path}?${qs}`, { headers, cache: 'no-store' });
    const body = await res.text();
    return new Response(body, {
      status: res.status === 429 ? 429 : res.ok ? 200 : res.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json({ code: 502, message: "Couldn't reach Lighter" }, { status: 502 });
  }
}

export const bad = (message: string) => Response.json({ code: 400, message }, { status: 400 });
