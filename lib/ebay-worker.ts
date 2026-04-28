// eBay API Fetch Logic (Isolated for Web)
import { Platform } from 'react-native';

export interface EbayComp {
    itemId: string;
    title: string;
    price: number;
    shipping: number;
    totalCost: number;
    condition: string;
    imageUrl: string;
    buyingOptions: string[];
    dateSold: Date; // Simulated or actual
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
}

export async function executeEbayFetch(
    appId?: string | null, secret?: string | null, query?: string, 
    isTrending: boolean = false,
    setName?: string, cardNumber?: string
): Promise<any> {
    if (!query) return { itemSummaries: [] };
    let data: any;

    // Build precision query for native path
    const buildPrecisionQuery = (q: string): string => {
        if (setName && cardNumber) {
            return `${q} "${setName}" ${cardNumber} -sealed -lot -bundle -repack -case -booster`;
        } else if (setName) {
            return `${q} "${setName}" -sealed -lot -bundle -repack -case -booster`;
        }
        return `${q} -sealed -lot -bundle -repack -case -booster`;
    };

    if (Platform.OS === 'web') {
        // Server-side proxy handles auth via env vars by default
        // BYOK credentials are forwarded as optional override
        const payload: any = { query, isTrending, setName, cardNumber };
        if (appId && secret) {
            payload.appId = appId;
            payload.secret = secret;
        }
        
        const response = await fetch('/api/ebay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Backend fetch failed: ${errText}`);
        }
        data = await response.json();
    } else {
        const authString = btoa(`${appId}:${secret}`);
        const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": `Basic ${authString}`
            },
            body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope"
        });

        if (!tokenRes.ok) {
            const text = await tokenRes.text();
            throw new Error(`Auth failed (${tokenRes.status}): ${text.substring(0, 50)}`);
        }
        const accessToken = (await tokenRes.json()).access_token;

        const limit = isTrending ? 10 : 50;
        const precisionQuery = isTrending ? query : buildPrecisionQuery(query);
        // Use relevance sort — NOT sort=-price which skews toward ultra-premium listings
        const browseRes = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(precisionQuery)}&limit=${limit}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"
            }
        });

        if (!browseRes.ok) {
            const text = await browseRes.text();
            throw new Error(`Data fetch failed (${browseRes.status}): ${text.substring(0, 50)}`);
        }
        
        data = await browseRes.json();
    }
    if (!data.itemSummaries || data.itemSummaries.length === 0) return { itemSummaries: [] };

    if (isTrending) return data; // Trending just needs raw fast data

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
    };

    return { clResult, itemSummaries: data.itemSummaries };
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
