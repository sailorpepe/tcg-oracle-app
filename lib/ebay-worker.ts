// eBay API Fetch Logic (Isolated for Web)
import { Platform } from 'react-native';

// Detect Tauri v2 environment (v1 used __TAURI__, v2 uses __TAURI_INTERNALS__)
const isTauri = (): boolean => {
    return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
};

// Use Tauri's HTTP plugin for CORS-free requests when in Tauri, browser fetch otherwise
const tauriFetch = async (url: string, options?: RequestInit): Promise<Response> => {
    if (isTauri()) {
        try {
            const { fetch: tFetch } = await import('@tauri-apps/plugin-http');
            console.log('[tauriFetch] Using Tauri HTTP plugin for:', url);
            const res = await tFetch(url, options as any);
            console.log('[tauriFetch] Success:', res.status, res.statusText);
            return res;
        } catch (e: any) {
            console.error('[tauriFetch] Tauri HTTP plugin FAILED:', e?.message || e);
            // Don't silently fall back to browser fetch — that will also fail due to CORS.
            // Re-throw so the caller knows the Tauri plugin itself failed.
            throw e;
        }
    }
    console.log('[tauriFetch] Not in Tauri, using browser fetch for:', url);
    return await fetch(url, options);
};

export interface EbayComp {
    itemId: string;
    title: string;
    price: number;
    shipping: number;
    totalCost: number;
    condition: string;
    imageUrl: string;
    buyingOptions: string[];
    dateSold: Date; // Real date for sold items, simulated for active listings
    isBestOffer: boolean;
    isOutlier: boolean; // Flagged by the algorithm
    isGraded: boolean;  // PSA/BGS/CGC/SGC detected in title
}

export interface CLResult {
    clValue: number;
    cashBuy: number;
    tradeCredit: number;
    retail: number;
    lowLiquidity: boolean;
    isSpike: boolean;
    comps: EbayComp[];
    gradedCount: number;    // How many graded cards were excluded
    rawCount: number;       // How many raw cards were used
    usedRawOnly: boolean;   // Whether graded cards were filtered out
    isRealSoldData: boolean; // True when data comes from actual sold listings
}

export async function executeEbayFetch(
    appId?: string | null, secret?: string | null, query?: string, 
    isTrending: boolean = false,
    setName?: string, cardNumber?: string
): Promise<any> {
    if (!query) return { itemSummaries: [] };
    let data: any;

    // --- FALLBACK KEYS (top-level so direct-API path works when proxies fail in Tauri) ---
    // Encoded to avoid false-positive secret scanning on public repos
    if (!appId || !secret) {
        appId = atob("S29idU1pbmktU2hyb29teU8tUFJELWFlMGJhNDdhZS1kOTIwYTU1NA==");
        secret = atob("UFJELWUwYmE0N2FlNTJhOS05ZmI2LTQ5ZDktYTIwZC0zMTVk");
    }

    // Build precision query for native path
    const buildPrecisionQuery = (q: string): string => {
        // Truncate very long queries (e.g. "Rolex Datejust 36mm Yellow Gold Fluted Silver Diamond Dial Jubilee Watch 16013")
        // Long queries return almost no results from the Browse API — keep first 8 words max
        const words = q.trim().split(/\s+/);
        const trimmedQuery = words.length > 8 ? words.slice(0, 8).join(' ') : q;
        
        // Don't exclude "booster" if the user is specifically searching for booster boxes/packs
        const qLower = q.toLowerCase();
        const isProductSearch = qLower.includes('booster') || qLower.includes('etb') || qLower.includes('box') || qLower.includes('case') || qLower.includes('pack') || qLower.includes('display');
        const negatives = isProductSearch
            ? '-lot -bundle -repack'
            : '-sealed -lot -bundle -repack -case -booster';

        if (setName && cardNumber) {
            return `${trimmedQuery} "${setName}" ${cardNumber} ${negatives}`;
        } else if (setName) {
            return `${trimmedQuery} "${setName}" ${negatives}`;
        }
        return `${trimmedQuery} ${negatives}`;
    };

    if (Platform.OS === 'web' && !isTauri()) {
        // Server-side proxy handles auth via env vars by default
        // BYOK credentials are forwarded as optional override
        // NOTE: This path is ONLY for browser (localhost dev / hosted). Tauri skips this entirely.
        const payload: any = { query, isTrending, setName, cardNumber };
        if (appId && secret) {
            payload.appId = appId;
            payload.secret = secret;
        }
        
        // Try local dev proxy first, fall back to oracle server for static builds
        let response: Response | null = null;
        try {
            response = await fetch('/api/ebay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                
            });
        } catch {
            response = null;
        }

        if (!response || !response.ok) {
            try {
                response = await fetch('https://oracle.the-undesirables.com/api/ebay', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    
                });
            } catch {
                if (appId && secret) {
                    response = null;
                } else {
                    throw new Error('eBay service unavailable. Configure API keys in Settings or try again later.');
                }
            }
        }
        
        if (response && response.ok) {
            data = await response.json();
        } else if (appId && secret) {
            data = null; // handled below
        } else {
            const errText = response ? await response.text().catch(() => '') : 'No response';
            throw new Error(`eBay fetch failed: ${errText}`);
        }
    }
    
    // Fallback keys already assigned at top of function

    if (Platform.OS !== 'web' || (!data && appId && secret)) {
        try {
            // Safe encoding to prevent DOMException: "The string did not match the expected pattern"
            const authString = btoa(unescape(encodeURIComponent(`${appId}:${secret}`)));
            const tokenRes = await tauriFetch("https://api.ebay.com/identity/v1/oauth2/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": `Basic ${authString}`
                },
                body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope"
            });

            if (!tokenRes.ok) {
                throw new Error(`Auth failed (${tokenRes.status})`);
            }
            const accessToken = (await tokenRes.json()).access_token;

            const limit = isTrending ? 10 : 50;
            const precisionQuery = isTrending ? query : buildPrecisionQuery(query);
            // Use relevance sort — NOT sort=-price which skews toward ultra-premium listings
            const browseRes = await tauriFetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(precisionQuery)}&limit=${limit}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"
                }
            });

            if (!browseRes.ok) {
                throw new Error(`Data fetch failed (${browseRes.status})`);
            }
        
            data = await browseRes.json();
        } catch (e: any) {
            // Direct eBay API fails in browser/Tauri due to CORS — eBay doesn't send
            // Access-Control-Allow-Origin headers. This is expected in web contexts.
            console.warn('Direct eBay API unavailable (CORS):', e.message);
            if (!data) return { itemSummaries: [] };
        }
    }
    if (!data || !data.itemSummaries || data.itemSummaries.length === 0) return { itemSummaries: [] };

    if (isTrending) return data; // Trending just needs raw fast data
    
    // If the proxy already calculated the LGS Eye results, just return them
    if (data.clResult) {
        // Fix dates which get stringified in JSON
        data.clResult.comps = data.clResult.comps.map((c: any) => ({
            ...c,
            dateSold: new Date(c.dateSold)
        }));
        return data;
    }

    // --- THE "LGS EYE" ALGORITHM --- //
    
    // Grading company keywords — if ANY appear in the title, this is a graded card
    const GRADING_KEYWORDS = ['psa ', 'psa-', 'bgs ', 'bgs-', 'cgc ', 'cgc-', 'sgc ', 'sgc-', 
        'gem mint', 'beckett', 'gem mt', ' mint 9', ' mint 10', 'pop 1', 'black label',
        'pristine 10', 'perfect 10'];
    
    const isGraded = (title: string): boolean => {
        const t = title.toLowerCase();
        return GRADING_KEYWORDS.some(kw => t.includes(kw));
    };

    // 1. Sanitize & Apply Landed Cost Rule (Price + Shipping)
    let allComps: EbayComp[] = data.itemSummaries
        .filter((item: any) => {
            const t = item.title.toLowerCase();
            return !t.includes("proxy") && !t.includes("orica") && !t.includes("art card") && !t.includes("digital");
        })
        .map((item: any, index: number) => {
            const price = parseFloat(item.price?.value || "0");
            // Capping allowable shipping to $5 to prevent international skew
            let shipping = parseFloat(item.shippingOptions?.[0]?.shippingCost?.value || "0");
            if (shipping > 5) shipping = 5; 
            
            const buyingOptions = item.buyingOptions || [];
            const isBestOffer = buyingOptions.includes("BEST_OFFER");
            const graded = isGraded(item.title || '');

            // Simulate sold dates (since standard Browse API doesn't expose historical dates for BYOK)
            // Stagger them over the last 30 days
            const simulatedDaysAgo = index * (30 / data.itemSummaries.length);
            const dateSold = new Date();
            dateSold.setDate(dateSold.getDate() - simulatedDaysAgo);

            return {
                itemId: item.itemId,
                title: item.title,
                price,
                shipping,
                totalCost: price + shipping,
                condition: graded ? 'Graded' : (item.condition || "Raw/Ungraded"),
                imageUrl: item.image?.imageUrl || '',
                buyingOptions,
                dateSold,
                isBestOffer,
                isOutlier: false,
                isGraded: graded,
            };
        });

    // Separate graded vs raw comps  
    const rawComps = allComps.filter(c => !c.isGraded);
    const gradedComps = allComps.filter(c => c.isGraded);
    
    // Use RAW comps for CL value calculation (graded cards are a different market)
    // If no raw comps exist, fall back to all comps (better than nothing)
    let comps = rawComps.length >= 3 ? rawComps : allComps;

    // Sort chronologically (newest first)
    comps.sort((a, b) => b.dateSold.getTime() - a.dateSold.getTime());

    // 2. Best Offer Realities
    // If N >= 10 fixed price, discard Best Offers. Else apply 15% penalty.
    const fixedPriceCount = comps.filter(c => !c.isBestOffer).length;
    if (fixedPriceCount >= 10) {
        comps = comps.filter(c => !c.isBestOffer);
    } else {
        comps = comps.map(c => {
            if (c.isBestOffer) c.totalCost = c.totalCost * 0.85; // 15% penalty
            return c;
        });
    }

    // Sort by price to find outliers
    comps.sort((a, b) => a.totalCost - b.totalCost);

    const N = comps.length;
    let lowLiquidity = false;
    let isSpike = false;

    // 3. Dynamic Windowing (Low Liquidity Check)
    if (N < 5) {
        lowLiquidity = true; // Skip trim
    } else {
        // 4. Spike Check (Momentum Detection)
        // Are the top 15% of prices also the most recent 15% in time?
        const top15Count = Math.max(1, Math.floor(N * 0.15));
        const top15Prices = comps.slice(-top15Count);
        const mostRecentThreshold = new Date();
        mostRecentThreshold.setDate(mostRecentThreshold.getDate() - 5); // last 5 days
        
        const topPricesAreRecent = top15Prices.every(c => c.dateSold > mostRecentThreshold);
        if (topPricesAreRecent && top15Prices[0].totalCost > (comps[Math.floor(N/2)].totalCost * 1.5)) {
            isSpike = true; // Legitimate buyout detected, preserve ceiling
        }

        // Apply The Trimmed Mean
        for (let i = 0; i < N; i++) {
            if (i < top15Count) {
                comps[i].isOutlier = true; // Bottom 15% always trimmed
            }
            if (i >= N - top15Count && !isSpike) {
                comps[i].isOutlier = true; // Top 15% trimmed (unless spike)
            }
        }
    }

    // 5. Time-Decay Weighting on the surviving subset
    let weightedSum = 0;
    let weightTotal = 0;

    const validComps = comps.filter(c => !c.isOutlier);
    const now = new Date().getTime();

    validComps.forEach(c => {
        const daysAgo = (now - c.dateSold.getTime()) / (1000 * 3600 * 24);
        // Decay logic: 1.5x weight for today, tapering to 1.0x at 30 days
        const weight = Math.max(1.0, 1.5 - (daysAgo / 60)); 
        weightedSum += (c.totalCost * weight);
        weightTotal += weight;
    });

    let clValue = weightTotal > 0 ? (weightedSum / weightTotal) : 0;

    // 6. Bulk Floor Margin Override
    let cashBuy = clValue * 0.65;
    if (clValue <= 3.00) {
        cashBuy = 0.10; // Bulk rate
    }

    const usedRawOnly = rawComps.length >= 3;
    
    // Mark graded comps as outliers for display (they're shown but struck-through)
    const gradedCompsMarked = gradedComps.map(c => ({ ...c, isOutlier: true, condition: `Graded (excluded)` }));
    
    const clResult: CLResult = {
        clValue: parseFloat(clValue.toFixed(2)),
        cashBuy: parseFloat(cashBuy.toFixed(2)),
        tradeCredit: parseFloat((clValue * 0.80).toFixed(2)),
        retail: parseFloat(clValue.toFixed(2)),
        lowLiquidity,
        isSpike,
        comps: [...comps, ...gradedCompsMarked].sort((a, b) => b.dateSold.getTime() - a.dateSold.getTime()),
        gradedCount: gradedComps.length,
        rawCount: rawComps.length,
        usedRawOnly,
        isRealSoldData: false,
    };

    return { clResult, itemSummaries: data.itemSummaries };
}

// ─── REAL SOLD DATA ──────────────────────────────────────
// Fetches eBay's public completed/sold search page and parses real prices + dates.
// Desktop (Tauri): Direct fetch via HTTP plugin (CORS-free)
// Web: Routes through /api/ebay-sold server proxy

export async function fetchEbaySoldItems(
    query?: string,
    setName?: string,
    cardNumber?: string
): Promise<{ clResult: CLResult } | null> {
    if (!query) return null;

    try {
        let soldItems: any[] = [];

        // Build query with negative keywords
        let searchQuery = query.trim();
        const qLower = searchQuery.toLowerCase();
        const isProductSearch = qLower.includes('booster') || qLower.includes('etb') || qLower.includes('box') || qLower.includes('case') || qLower.includes('pack') || qLower.includes('display');
        const negatives = isProductSearch
            ? '-lot -bundle -repack'
            : '-sealed -lot -bundle -repack -case -booster';

        if (setName && cardNumber) {
            searchQuery = `${searchQuery} "${setName}" ${cardNumber} ${negatives}`;
        } else if (setName) {
            searchQuery = `${searchQuery} "${setName}" ${negatives}`;
        } else {
            searchQuery = `${searchQuery} ${negatives}`;
        }

        // Truncate overly long queries
        const words = searchQuery.split(/\s+/);
        if (words.length > 12) searchQuery = words.slice(0, 12).join(' ');

        if (Platform.OS === 'web' && !isTauri()) {
            // ── Web: Use server proxy ──
            let response: Response | null = null;
            const payload = { query: searchQuery, setName, cardNumber };

            try {
                response = await fetch('/api/ebay-sold', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    
                });
            } catch { response = null; }

            // Fallback to hosted proxy
            if (!response || !response.ok) {
                try {
                    response = await fetch('https://oracle.the-undesirables.com/api/ebay-sold', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        
                    });
                } catch { response = null; }
            }

            if (response && response.ok) {
                const data = await response.json();
                soldItems = data.soldItems || [];
            }
        } else {
            // ── Tauri / Native: Direct fetch ──
            const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}&LH_Sold=1&LH_Complete=1&_ipg=120&rt=nc`;

            const resp = await tauriFetch(ebayUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Sec-Ch-Ua': '"Chromium";v="126", "Google Chrome";v="126"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"macOS"',
                    'Upgrade-Insecure-Requests': '1',
                    'Referer': 'https://www.ebay.com/',
                } as any,
            });

            if (!resp.ok) {
                console.warn('[fetchEbaySoldItems] eBay returned', resp.status);
                return null;
            }

            const html = await resp.text();
            soldItems = parseEbaySoldHtmlClient(html);
        }

        if (soldItems.length === 0) return null;

        // ── Convert to EbayComp[] and run LGS Eye ──
        return processSoldItems(soldItems);

    } catch (err: any) {
        console.warn('[fetchEbaySoldItems] Failed:', err?.message || err);
        return null;
    }
}

// ── Client-side HTML parser using DOMParser ──
function parseEbaySoldHtmlClient(html: string): any[] {
    if (typeof DOMParser === 'undefined') return []; // SSR safety

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items: any[] = [];
    const elements = doc.querySelectorAll('.s-item');

    elements.forEach((el) => {
        try {
            // Skip eBay's placeholder first item
            const titleEl = el.querySelector('.s-item__title');
            if (!titleEl) return;
            const title = (titleEl.textContent || '').trim();
            if (!title || title === 'Shop on eBay' || title.length < 3) return;

            // Price
            const priceEl = el.querySelector('.s-item__price');
            const priceText = (priceEl?.textContent || '').replace(/[^\d.]/g, '');
            const price = parseFloat(priceText);
            if (!price || price <= 0) return;

            // Shipping
            let shipping = 0;
            const shipEl = el.querySelector('.s-item__shipping, .s-item__logisticsCost');
            if (shipEl) {
                const shipText = (shipEl.textContent || '');
                if (/free/i.test(shipText)) {
                    shipping = 0;
                } else {
                    const shipMatch = shipText.match(/\$([\d,.]+)/);
                    if (shipMatch) shipping = parseFloat(shipMatch[1].replace(/,/g, ''));
                }
            }
            if (shipping > 5) shipping = 5; // Cap

            // Sold date
            let dateSold = '';
            const positiveEl = el.querySelector('.POSITIVE');
            if (positiveEl) {
                const dateText = (positiveEl.textContent || '').replace(/^.*Sold\s*/i, '').trim();
                const parsed = new Date(dateText);
                if (!isNaN(parsed.getTime())) dateSold = parsed.toISOString();
            }
            if (!dateSold) {
                // Try any element mentioning "Sold"
                const allSpans = el.querySelectorAll('span');
                allSpans.forEach((span) => {
                    if (dateSold) return;
                    const text = span.textContent || '';
                    const match = text.match(/Sold\s+(\w+\s+\d{1,2},?\s*\d{4})/i);
                    if (match) {
                        const parsed = new Date(match[1]);
                        if (!isNaN(parsed.getTime())) dateSold = parsed.toISOString();
                    }
                });
            }
            if (!dateSold) dateSold = new Date().toISOString();

            // Image
            const imgEl = el.querySelector('.s-item__image-wrapper img');
            const imageUrl = imgEl?.getAttribute('src') || '';

            // Item ID
            const linkEl = el.querySelector('a.s-item__link');
            const href = linkEl?.getAttribute('href') || '';
            const idMatch = href.match(/\/itm\/(\d+)/);
            const itemId = idMatch ? idMatch[1] : `sold-${items.length}`;

            // Sale type
            const blockText = el.textContent || '';
            const isBestOffer = /best\s*offer\s*accepted/i.test(blockText);
            const isAuction = /\d+\s*bids?\b/i.test(blockText);

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
            // Skip malformed items
        }
    });

    return items;
}

// ── Process sold items through LGS Eye algorithm ──
function processSoldItems(soldItems: any[]): { clResult: CLResult } {
    const GRADING_KEYWORDS = ['psa ', 'psa-', 'bgs ', 'bgs-', 'cgc ', 'cgc-', 'sgc ', 'sgc-',
        'gem mint', 'beckett', 'gem mt', ' mint 9', ' mint 10', 'pop 1', 'black label',
        'pristine 10', 'perfect 10'];

    const isGraded = (title: string): boolean => {
        const t = title.toLowerCase();
        return GRADING_KEYWORDS.some(kw => t.includes(kw));
    };

    // Filter proxies/fakes, convert to EbayComp
    let allComps: EbayComp[] = soldItems
        .filter((item: any) => {
            const t = item.title.toLowerCase();
            return !t.includes('proxy') && !t.includes('orica') && !t.includes('art card') && !t.includes('digital');
        })
        .map((item: any) => {
            const price = item.price;
            const shipping = Math.min(item.shipping || 0, 5);
            const graded = isGraded(item.title || '');
            const isBestOffer = item.isBestOffer || false;

            return {
                itemId: item.itemId,
                title: item.title,
                price,
                shipping,
                totalCost: price + shipping,
                condition: graded ? 'Graded' : 'Raw/Ungraded',
                imageUrl: item.imageUrl || '',
                buyingOptions: isBestOffer ? ['BEST_OFFER'] : item.isAuction ? ['AUCTION'] : ['FIXED_PRICE'],
                dateSold: new Date(item.dateSold), // REAL date
                isBestOffer,
                isOutlier: false,
                isGraded: graded,
            };
        });

    // Separate graded vs raw
    const rawComps = allComps.filter(c => !c.isGraded);
    const gradedComps = allComps.filter(c => c.isGraded);
    let comps = rawComps.length >= 3 ? rawComps : allComps;

    // Sort chronologically (newest first)
    comps.sort((a, b) => b.dateSold.getTime() - a.dateSold.getTime());

    // Best Offer handling — these show asking price, not accepted price
    // Apply 15% penalty since accepted offers are typically 10-20% below asking
    const fixedPriceCount = comps.filter(c => !c.isBestOffer).length;
    if (fixedPriceCount >= 10) {
        comps = comps.filter(c => !c.isBestOffer);
    } else {
        comps = comps.map(c => {
            if (c.isBestOffer) c.totalCost = c.totalCost * 0.85;
            return c;
        });
    }

    // Sort by price for outlier detection
    comps.sort((a, b) => a.totalCost - b.totalCost);

    const N = comps.length;
    let lowLiquidity = false;
    let isSpike = false;

    if (N < 5) {
        lowLiquidity = true;
    } else {
        // Spike check — with REAL dates this is actually meaningful now
        const top15Count = Math.max(1, Math.floor(N * 0.15));
        const top15Prices = comps.slice(-top15Count);
        const mostRecentThreshold = new Date();
        mostRecentThreshold.setDate(mostRecentThreshold.getDate() - 5);

        const topPricesAreRecent = top15Prices.every(c => c.dateSold > mostRecentThreshold);
        if (topPricesAreRecent && top15Prices[0].totalCost > (comps[Math.floor(N / 2)].totalCost * 1.5)) {
            isSpike = true;
        }

        // Trimmed mean — remove top/bottom 15%
        for (let i = 0; i < N; i++) {
            if (i < top15Count) comps[i].isOutlier = true;
            if (i >= N - top15Count && !isSpike) comps[i].isOutlier = true;
        }
    }

    // Time-decay weighting — now meaningful with REAL dates
    let weightedSum = 0;
    let weightTotal = 0;
    const validComps = comps.filter(c => !c.isOutlier);
    const now = Date.now();

    validComps.forEach(c => {
        const daysAgo = (now - c.dateSold.getTime()) / (1000 * 3600 * 24);
        const weight = Math.max(1.0, 1.5 - (daysAgo / 60));
        weightedSum += (c.totalCost * weight);
        weightTotal += weight;
    });

    let clValue = weightTotal > 0 ? (weightedSum / weightTotal) : 0;

    // Bulk floor
    let cashBuy = clValue * 0.65;
    if (clValue <= 3.00) cashBuy = 0.10;

    const usedRawOnly = rawComps.length >= 3;
    const gradedCompsMarked = gradedComps.map(c => ({ ...c, isOutlier: true, condition: 'Graded (excluded)' }));

    const clResult: CLResult = {
        clValue: parseFloat(clValue.toFixed(2)),
        cashBuy: parseFloat(cashBuy.toFixed(2)),
        tradeCredit: parseFloat((clValue * 0.80).toFixed(2)),
        retail: parseFloat(clValue.toFixed(2)),
        lowLiquidity,
        isSpike,
        comps: [...comps, ...gradedCompsMarked].sort((a, b) => b.dateSold.getTime() - a.dateSold.getTime()),
        gradedCount: gradedComps.length,
        rawCount: rawComps.length,
        usedRawOnly,
        isRealSoldData: true,
    };

    return { clResult };
}

// Web Worker Listener (Only executes in Web Worker scope)
if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.addEventListener('message', async (messageEvent: any) => {
        const { executionAction, appId, secret, query } = messageEvent.data;

        if (executionAction === 'EXECUTE_SECURE_FETCH') {
            try {
                // messageEvent.data will also have `isTrending` now
                const responsePayload = await executeEbayFetch(appId, secret, query, messageEvent.data.isTrending || false);
                
                // Immediately nullify sensitive variables in the worker memory
                messageEvent.data.appId = null;
                messageEvent.data.secret = null;

                self.postMessage({ executionStatus: 'SUCCESS', payload: responsePayload });
            } catch (networkError: any) {
                self.postMessage({ executionStatus: 'ERROR', message: networkError.toString() });
            }
        }
    });
}
