export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { appId, secret, query, isTrending, setName, cardNumber } = body;

    if (!appId || !secret || !query) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Get OAuth Token (server-side — no CORS restrictions)
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
      const errText = await tokenRes.text();
      return new Response(JSON.stringify({ error: "eBay authentication failed. Check your App ID and Secret in Settings." }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Search eBay Browse API
    const limit = isTrending ? 10 : 50;
    
    // Build precision query using collector number + set name when available
    let searchQuery = query;
    if (setName && cardNumber) {
      // e.g. "Mega Charizard X ex" "Phantasmal Flames" 13 -sealed -lot -bundle -repack -case
      searchQuery = `${query} "${setName}" ${cardNumber} -sealed -lot -bundle -repack -case -booster`;
    } else if (setName) {
      searchQuery = `${query} "${setName}" -sealed -lot -bundle -repack -case -booster`;
    } else {
      searchQuery = `${query} -sealed -lot -bundle -repack -case -booster`;
    }
    
    // Use relevance sort (NOT sort=-price which only returns the most expensive listings)
    const browseUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchQuery)}&limit=${limit}`;

    const browseRes = await fetch(browseUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    });

    if (!browseRes.ok) {
      const errText = await browseRes.text();
      return new Response(JSON.stringify({ error: "eBay search returned no results or failed. Try a different query." }), {
        status: browseRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await browseRes.json();
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
