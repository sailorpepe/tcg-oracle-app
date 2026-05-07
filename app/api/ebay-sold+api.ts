// ── eBay Sold Listings Proxy ──
// Fetches real sold/completed items from eBay's public search.
// Uses a two-step approach: first gets a session, then fetches results.
// This bypasses CORS for browser clients. Tauri desktop fetches directly.

// In-memory cache: key → { data, timestamp }
const soldCache = new Map<string, { data: any; ts: number }>();
const SOLD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Shared session cookie jar (refreshed per-deploy)
let sessionCookies: string = '';
let sessionTs: number = 0;
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

// Browser-like headers that eBay expects
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Ch-Ua': '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="8"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Cache-Control': 'max-age=0',
};

async function getSessionCookies(): Promise<string> {
  // Reuse existing session if fresh
  if (sessionCookies && (Date.now() - sessionTs) < SESSION_TTL) {
    return sessionCookies;
  }

  try {
    // Visit eBay homepage to get session cookies
    const resp = await fetch('https://www.ebay.com/', {
      method: 'GET',
      headers: BROWSER_HEADERS,
      redirect: 'manual', // Don't follow redirects — just capture cookies
    });

    const setCookies = resp.headers.getSetCookie?.() || [];
    if (setCookies.length > 0) {
      sessionCookies = setCookies
        .map(c => c.split(';')[0]) // Extract just name=value
        .join('; ');
      sessionTs = Date.now();
    }
  } catch {
    // If homepage fails, continue without cookies
  }

  return sessionCookies;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, setName, cardNumber } = body;

    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Build search query ──
    let searchQuery = query;
    if (setName && cardNumber) {
      searchQuery = `${query} "${setName}" ${cardNumber} -sealed -lot -bundle -repack -case -booster`;
    } else if (setName) {
      searchQuery = `${query} "${setName}" -sealed -lot -bundle -repack -case -booster`;
    } else {
      searchQuery = `${query} -sealed -lot -bundle -repack -case -booster`;
    }

    const words = searchQuery.trim().split(/\s+/);
    if (words.length > 12) searchQuery = words.slice(0, 12).join(' ');

    // ── Cache check ──
    const cacheKey = `sold|${searchQuery}`;
    const cached = soldCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < SOLD_CACHE_TTL) {
      return new Response(JSON.stringify({ ...cached.data, _cached: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Get session cookies ──
    const cookies = await getSessionCookies();

    // ── Fetch eBay sold listings page ──
    const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}&LH_Sold=1&LH_Complete=1&_ipg=120&rt=nc`;

    const resp = await fetch(ebayUrl, {
      headers: {
        ...BROWSER_HEADERS,
        ...(cookies ? { 'Cookie': cookies } : {}),
        'Referer': 'https://www.ebay.com/',
      },
    });

    if (!resp.ok) {
      // If first attempt fails, try without cookies (cold request)
      const retryResp = await fetch(ebayUrl, {
        headers: {
          ...BROWSER_HEADERS,
          'Referer': 'https://www.ebay.com/',
        },
      });

      if (!retryResp.ok) {
        return new Response(JSON.stringify({ 
          error: `eBay returned ${retryResp.status}`,
          hint: 'eBay may be rate-limiting. Data will come from active listings instead.'
        }), {
          status: retryResp.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const retryHtml = await retryResp.text();
      const retryItems = parseEbaySoldHtml(retryHtml);
      const retryResult = { soldItems: retryItems, total: retryItems.length };
      soldCache.set(cacheKey, { data: retryResult, ts: Date.now() });
      return new Response(JSON.stringify(retryResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Capture new cookies from the response for future requests
    const newCookies = resp.headers.getSetCookie?.() || [];
    if (newCookies.length > 0) {
      const extraCookies = newCookies.map(c => c.split(';')[0]).join('; ');
      sessionCookies = sessionCookies 
        ? `${sessionCookies}; ${extraCookies}` 
        : extraCookies;
      sessionTs = Date.now();
    }

    const html = await resp.text();
    const items = parseEbaySoldHtml(html);

    const result = { soldItems: items, total: items.length };

    // ── Cache store ──
    soldCache.set(cacheKey, { data: result, ts: Date.now() });
    if (soldCache.size > 100) {
      const oldest = [...soldCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
      for (let i = 0; i < 25; i++) soldCache.delete(oldest[i][0]);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── HTML Parser ──
// Extracts sold items from eBay's search results HTML using regex.
// eBay's .s-item structure has been stable for years.

interface SoldItemRaw {
  title: string;
  price: number;
  shipping: number;
  dateSold: string; // ISO date string
  imageUrl: string;
  itemId: string;
  isBestOffer: boolean;
  isAuction: boolean;
}

function parseEbaySoldHtml(html: string): SoldItemRaw[] {
  const items: SoldItemRaw[] = [];

  // Split by s-item boundaries
  const itemBlocks = html.split(/class="s-item\s/);

  for (let i = 1; i < itemBlocks.length; i++) {
    const block = itemBlocks[i];

    // Skip dividers and placeholders
    if (block.includes('srp-river-answer--REWRITE_START')) continue;
    if (block.includes('s-item__pl-on-bottom') && !block.includes('s-item__price')) continue;

    try {
      // ── Title ──
      const titleMatch = block.match(/class="s-item__title"[^>]*>(?:<span[^>]*>)?\s*(.*?)\s*(?:<\/span>)?<\/(?:div|h3|span)/s);
      const title = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
        : '';
      if (!title || title === 'Shop on eBay' || title.length < 3) continue;

      // ── Price ──
      const priceMatch = block.match(/class="s-item__price"[^>]*>(?:<span[^>]*>)?\s*\$?([\d,]+\.?\d*)/);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
      if (price <= 0) continue;

      // ── Shipping ──
      let shipping = 0;
      const shipMatch = block.match(/(?:logisticsCost|shipping)[^>]*>[^<]*\+?\$?([\d,]+\.?\d*)\s*ship/i);
      if (shipMatch) {
        shipping = parseFloat(shipMatch[1].replace(/,/g, ''));
      }
      const freeShip = /free\s*shipping/i.test(block);
      if (freeShip) shipping = 0;
      if (shipping > 5) shipping = 5;

      // ── Sold Date ──
      const dateMatch = block.match(/class="POSITIVE"[^>]*>[^<]*Sold\s+([\w]+\s+\d{1,2},?\s*\d{4})/i);
      let dateSold = '';
      if (dateMatch) {
        const parsed = new Date(dateMatch[1].trim());
        if (!isNaN(parsed.getTime())) {
          dateSold = parsed.toISOString();
        }
      }
      if (!dateSold) {
        const altDateMatch = block.match(/Sold\s+([\w]{3}\s+\d{1,2},?\s*\d{4})/i);
        if (altDateMatch) {
          const parsed = new Date(altDateMatch[1].trim());
          if (!isNaN(parsed.getTime())) dateSold = parsed.toISOString();
        }
      }
      if (!dateSold) {
        dateSold = new Date().toISOString();
      }

      // ── Image ──
      const imgMatch = block.match(/s-item__image-wrapper[^>]*>.*?<img[^>]*src="([^"]+)"/s);
      const imageUrl = imgMatch ? imgMatch[1] : '';

      // ── Item ID ──
      const idMatch = block.match(/\/itm\/(\d+)/);
      const itemId = idMatch ? idMatch[1] : `sold-${i}`;

      // ── Sale Type ──
      const isBestOffer = /best\s*offer\s*accepted/i.test(block) || /or\s*Best\s*Offer/i.test(block);
      const isAuction = /\d+\s*bids?\b/i.test(block);

      items.push({
        title,
        price,
        shipping,
        dateSold,
        imageUrl,
        itemId,
        isBestOffer,
        isAuction,
      });
    } catch {
      continue;
    }
  }

  return items;
}
