// ── eBay Browse API Proxy ──
// Default: uses server-side env credentials (zero friction for users)
// Override: accepts BYOK appId/secret from the client for power users

// In-memory cache: key → { data, timestamp }
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, isTrending, setName, cardNumber } = body;
    
    // BYOK override — if client sends credentials, use those instead
    let appId = body.appId || process.env.EBAY_APP_ID || '';
    let secret = body.secret || process.env.EBAY_CLIENT_SECRET || '';

    if (!appId || !secret) {
      return new Response(JSON.stringify({ 
        error: "eBay API not configured. Set EBAY_APP_ID and EBAY_CLIENT_SECRET in environment, or provide your own keys in Settings." 
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query parameter" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Cache Check ──
    const limit = isTrending ? 10 : 50;
    const cacheKey = `${query}|${setName || ''}|${cardNumber || ''}|${isTrending ? 't' : 'f'}`;
    
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
      return new Response(JSON.stringify({ ...cached.data, _cached: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── OAuth Token ──
    const authString = Buffer.from(`${appId}:${secret}`).toString('base64');

    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${authString}`,
      },
      body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    });

    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: "eBay authentication failed. Check API credentials." }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // ── Build Search Query ──
    let searchQuery = query;
    if (!isTrending) {
      // Don't exclude "booster"/"case" when the user is searching for those products
      const qLower = query.toLowerCase();
      const isProductSearch = qLower.includes('booster') || qLower.includes('etb') || qLower.includes('box') || qLower.includes('case') || qLower.includes('pack') || qLower.includes('display');
      const negatives = isProductSearch
        ? '-lot -bundle -repack'
        : '-sealed -lot -bundle -repack -case -booster';

      if (setName && cardNumber) {
        searchQuery = `${query} "${setName}" ${cardNumber} ${negatives}`;
      } else if (setName) {
        searchQuery = `${query} "${setName}" ${negatives}`;
      } else {
        searchQuery = `${query} ${negatives}`;
      }
    }

    const browseUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchQuery)}&limit=${limit}`;

    const browseRes = await fetch(browseUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    });

    if (!browseRes.ok) {
      return new Response(JSON.stringify({ error: "eBay search returned no results or failed. Try a different query." }), {
        status: browseRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await browseRes.json();
    
    // ── Cache Store ──
    cache.set(cacheKey, { data, ts: Date.now() });
    
    // Evict old entries if cache gets too large (> 200 entries)
    if (cache.size > 200) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
      for (let i = 0; i < 50; i++) {
        cache.delete(oldest[i][0]);
      }
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
