// ── LitVM Price Oracle Proxy ──
// Proxies the Vercel API to avoid CORS when fetching from the browser.
// The live website API reads directly from the on-chain contract.

export const dynamic = 'force-dynamic';

let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 60_000; // 60 seconds

export async function GET() {
  try {
    // Return cached data if fresh
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return new Response(JSON.stringify(cache.data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resp = await fetch('https://the-undesirables.vercel.app/api/litvm', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Upstream: ${resp.status}` }), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();
    cache = { data, ts: Date.now() };

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
