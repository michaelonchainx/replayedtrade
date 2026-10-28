/** Fallback proxy for Hyperliquid /info — the client calls Hyperliquid directly (CORS is allowed). */
const ALLOWED = new Set(['meta', 'candleSnapshot']);

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path.join('/') !== 'info') return Response.json({ error: 'not found' }, { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const type = (body as { type?: unknown })?.type;
  if (typeof type !== 'string' || !ALLOWED.has(type)) return Response.json({ error: 'type not allowed' }, { status: 400 });
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
  } catch {
    return Response.json({ error: 'upstream unreachable' }, { status: 502 });
  }
}
