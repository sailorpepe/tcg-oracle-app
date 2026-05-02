/**
 * TCG Oracle — Clean API Client
 * 7 Free, Legally Clear APIs:
 *   - Pokémon TCG API (pokemontcg.io)
 *   - Scryfall (Magic: The Gathering)
 *   - YGOProDeck (Yu-Gi-Oh!)
 *   - OPTCG API (One Piece)
 *   - Lorcast (Lorcana)
 *   - SWU API (Star Wars Unlimited)
 *   - digimoncard.io (Digimon)
 * 
 * Zero TCGCSV dependency.
 */

// ─── Types ────────────────────────────────────────────

export type GameId = 'pokemon' | 'magic' | 'yugioh' | 'onepiece' | 'lorcana' | 'starwars' | 'digimon' | 'ebay';

export interface GameInfo {
  id: GameId;
  name: string;
  emoji: string;
  color: string;
  description: string;
}

export interface CardSet {
  id: string;
  name: string;
  code?: string;
  releaseDate?: string;
  totalCards?: number;
  imageUrl?: string;
  game: GameId;
}

export interface Card {
  id: string;
  name: string;
  imageUrl: string;
  imageUrlSmall?: string;
  set: string;
  rarity?: string;
  price?: number;
  priceSource?: string;
  game: GameId;
  type?: string;
  number?: string;
}

export interface SearchResult {
  cards: Card[];
  total: number;
  game: GameId;
}

// ─── Game Registry ────────────────────────────────────

export const GAMES: GameInfo[] = [
  { id: 'pokemon',  name: 'Pokémon',  emoji: '⚡', color: '#ffd700', description: 'Gotta catch \'em all' },
  { id: 'magic',    name: 'Magic',    emoji: '🔮', color: '#9146ff', description: 'The Gathering' },
  { id: 'yugioh',   name: 'Yu-Gi-Oh!', emoji: '🃏', color: '#e44d26', description: 'It\'s time to duel' },
  { id: 'onepiece', name: 'One Piece', emoji: '🏴‍☠️', color: '#e74c3c', description: 'Set sail for adventure' },
  { id: 'lorcana',  name: 'Lorcana',  emoji: '✨', color: '#6366f1', description: 'A Disney adventure' },
  { id: 'starwars', name: 'Star Wars', emoji: '⚔️', color: '#c0392b', description: 'Unlimited power' },
  { id: 'digimon',  name: 'Digimon',  emoji: '🦕', color: '#3498db', description: 'Digital Monsters' },
];

// ─── Pokémon TCG API ──────────────────────────────────

const POKEMON_API = 'https://api.pokemontcg.io/v2';

export async function searchPokemon(query: string): Promise<SearchResult> {
  const resp = await fetch(`${POKEMON_API}/cards?q=name:${encodeURIComponent(query)}*&pageSize=20&orderBy=-set.releaseDate`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Pokémon API: ${resp.status}`);
  const data = await resp.json();
  return {
    game: 'pokemon',
    total: data.totalCount || 0,
    cards: (data.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.images?.large || c.images?.small || '',
      imageUrlSmall: c.images?.small || '',
      set: c.set?.name || '',
      rarity: c.rarity || '',
      price: c.tcgplayer?.prices?.holofoil?.market
        || c.tcgplayer?.prices?.normal?.market
        || c.tcgplayer?.prices?.reverseHolofoil?.market
        || c.cardmarket?.prices?.averageSellPrice
        || null,
      priceSource: c.tcgplayer ? 'Market' : c.cardmarket ? 'Market' : undefined,
      game: 'pokemon' as GameId,
      type: c.supertype || '',
      number: c.number || '',
    })),
  };
}

export async function getPokemonSets(): Promise<CardSet[]> {
  const resp = await fetch(`${POKEMON_API}/sets?orderBy=-releaseDate&pageSize=50`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Pokémon Sets API: ${resp.status}`);
  const data = await resp.json();
  return (data.data || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    code: s.ptcgoCode || s.id,
    releaseDate: s.releaseDate,
    totalCards: s.printedTotal || s.total,
    imageUrl: s.images?.logo || s.images?.symbol || '',
    game: 'pokemon' as GameId,
  }));
}

export async function getPokemonSetCards(setId: string): Promise<Card[]> {
  // Paginate through ALL cards in the set (API max is 250 per page)
  const allCards: Card[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const resp = await fetch(`${POKEMON_API}/cards?q=set.id:${setId}&pageSize=250&page=${page}&orderBy=number`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!resp.ok) throw new Error(`Pokémon Cards API: ${resp.status}`);
    const data = await resp.json();
    const cards = (data.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.images?.large || c.images?.small || '',
      imageUrlSmall: c.images?.small || '',
      set: c.set?.name || '',
      rarity: c.rarity || '',
      price: c.tcgplayer?.prices?.holofoil?.market
        || c.tcgplayer?.prices?.normal?.market
        || c.tcgplayer?.prices?.reverseHolofoil?.market
        || null,
      priceSource: 'Market',
      game: 'pokemon' as GameId,
      type: c.supertype || '',
      number: c.number || '',
    }));
    allCards.push(...cards);
    // If we got fewer than 250, we've reached the last page
    hasMore = cards.length === 250;
    page++;
  }

  return allCards;
}

// ─── Scryfall (Magic: The Gathering) ──────────────────

const SCRYFALL_API = 'https://api.scryfall.com';

export async function searchMagic(query: string): Promise<SearchResult> {
  const resp = await fetch(`${SCRYFALL_API}/cards/search?q=${encodeURIComponent(query)}&order=released&dir=desc`, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'TCGOracle/1.0.0',
    },
  });
  if (!resp.ok) {
    if (resp.status === 404) return { game: 'magic', total: 0, cards: [] };
    throw new Error(`Scryfall: ${resp.status}`);
  }
  const data = await resp.json();
  return {
    game: 'magic',
    total: data.total_cards || 0,
    cards: (data.data || []).slice(0, 20).map((c: any) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.image_uris?.normal || c.image_uris?.large || (c.card_faces?.[0]?.image_uris?.normal) || '',
      imageUrlSmall: c.image_uris?.small || (c.card_faces?.[0]?.image_uris?.small) || '',
      set: c.set_name || '',
      rarity: c.rarity ? c.rarity.charAt(0).toUpperCase() + c.rarity.slice(1) : '',
      price: c.prices?.usd ? parseFloat(c.prices.usd) : c.prices?.usd_foil ? parseFloat(c.prices.usd_foil) : null,
      priceSource: 'Market',
      game: 'magic' as GameId,
      type: c.type_line || '',
      number: c.collector_number || '',
    })),
  };
}

export async function getMagicSets(): Promise<CardSet[]> {
  const resp = await fetch(`${SCRYFALL_API}/sets`, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'TCGOracle/1.0.0' },
  });
  if (!resp.ok) throw new Error(`Scryfall Sets: ${resp.status}`);
  const data = await resp.json();
  // Filter to main expansion/core sets, most recent first
  const validTypes = new Set(['expansion', 'core', 'draft_innovation', 'masters', 'commander']);
  return (data.data || [])
    .filter((s: any) => validTypes.has(s.set_type) && s.card_count > 0)
    .slice(0, 50)
    .map((s: any) => ({
      id: s.code,
      name: s.name,
      code: s.code.toUpperCase(),
      releaseDate: s.released_at,
      totalCards: s.card_count,
      imageUrl: s.icon_svg_uri || '',
      game: 'magic' as GameId,
    }));
}

// ─── YGOProDeck (Yu-Gi-Oh!) ───────────────────────────

const YGOPRO_API = 'https://db.ygoprodeck.com/api/v7';

export async function searchYugioh(query: string): Promise<SearchResult> {
  const resp = await fetch(`${YGOPRO_API}/cardinfo.php?fname=${encodeURIComponent(query)}&num=20&offset=0`);
  if (!resp.ok) {
    if (resp.status === 400) return { game: 'yugioh', total: 0, cards: [] };
    throw new Error(`YGOProDeck: ${resp.status}`);
  }
  const data = await resp.json();
  if (data.error) return { game: 'yugioh', total: 0, cards: [] };
  return {
    game: 'yugioh',
    total: (data.data || []).length,
    cards: (data.data || []).slice(0, 20).map((c: any) => {
      const prices = c.card_prices?.[0] || {};
      const bestPrice = parseFloat(prices.tcgplayer_price) || parseFloat(prices.ebay_price) || parseFloat(prices.amazon_price) || null;
      return {
        id: String(c.id),
        name: c.name,
        imageUrl: c.card_images?.[0]?.image_url || '',
        imageUrlSmall: c.card_images?.[0]?.image_url_small || '',
        set: c.card_sets?.[0]?.set_name || c.type || '',
        rarity: c.card_sets?.[0]?.set_rarity || '',
        price: bestPrice && bestPrice > 0 ? bestPrice : null,
        priceSource: 'Market',
        game: 'yugioh' as GameId,
        type: c.type || '',
        number: '',
      };
    }),
  };
}

export async function getYugiohSets(): Promise<CardSet[]> {
  const resp = await fetch(`${YGOPRO_API}/cardsets.php`);
  if (!resp.ok) throw new Error(`YGOProDeck Sets: ${resp.status}`);
  const data: any[] = await resp.json();
  return data
    .filter((s: any) => s.tcg_date)
    .sort((a: any, b: any) => new Date(b.tcg_date).getTime() - new Date(a.tcg_date).getTime())
    .slice(0, 50)
    .map((s: any) => ({
      id: s.set_code,
      name: s.set_name,
      code: s.set_code,
      releaseDate: s.tcg_date,
      totalCards: s.num_of_cards,
      game: 'yugioh' as GameId,
    }));
}

// ─── OPTCG API (One Piece) ────────────────────────────

const OPTCG_API = 'https://optcgapi.com/api';

export async function searchOnePiece(query: string): Promise<SearchResult> {
  try {
    const resp = await fetch(`${OPTCG_API}/sets/filtered/?card_name=${encodeURIComponent(query)}`);
    if (!resp.ok) return { game: 'onepiece', total: 0, cards: [] };
    const data = await resp.json();
    if (data.error) return { game: 'onepiece', total: 0, cards: [] };
    const cards = Array.isArray(data) ? data : [];
    return {
      game: 'onepiece',
      total: cards.length,
      cards: cards.slice(0, 20).map((c: any) => ({
        id: c.card_set_id || c.card_image_id || String(Math.random()),
        name: c.card_name || '',
        imageUrl: c.card_image || '',
        imageUrlSmall: c.card_image || '',
        set: c.set_name || '',
        rarity: c.rarity || '',
        price: c.market_price || c.inventory_price || null,
        priceSource: c.market_price ? 'TCGPlayer' : undefined,
        game: 'onepiece' as GameId,
        type: c.card_type || '',
        number: c.card_set_id || '',
      })),
    };
  } catch {
    return { game: 'onepiece', total: 0, cards: [] };
  }
}

export async function getOnePieceSets(): Promise<CardSet[]> {
  try {
    const resp = await fetch(`${OPTCG_API}/allSets/`);
    if (!resp.ok) return [];
    const data: any[] = await resp.json();
    return data.map((s: any) => ({
      id: s.set_id,
      name: s.set_name,
      code: s.set_id,
      game: 'onepiece' as GameId,
    }));
  } catch {
    return [];
  }
}

// ─── Unified Search ───────────────────────────────────

export async function searchCards(query: string, game?: GameId): Promise<SearchResult> {
  if (!query.trim()) return { cards: [], total: 0, game: game || 'pokemon' };

  if (game) {
    switch (game) {
      case 'pokemon': return searchPokemon(query);
      case 'magic': return searchMagic(query);
      case 'yugioh': return searchYugioh(query);
      case 'onepiece': return searchOnePiece(query);
      case 'lorcana': return searchLorcana(query);
      case 'starwars': return searchStarWars(query);
      case 'digimon': return searchDigimon(query);
    }
  }

  // Search all games in parallel
  const results = await Promise.allSettled([
    searchPokemon(query),
    searchMagic(query),
    searchYugioh(query),
    searchOnePiece(query),
    searchLorcana(query),
    searchStarWars(query),
    searchDigimon(query),
  ]);

  const allCards: Card[] = [];
  let total = 0;

  for (const r of results) {
    if (r.status === 'fulfilled') {
      allCards.push(...r.value.cards);
      total += r.value.total;
    }
  }

  return { cards: allCards.slice(0, 40), total, game: 'pokemon' };
}

// ─── Set browser ──────────────────────────────────────

export async function getSets(game: GameId): Promise<CardSet[]> {
  switch (game) {
    case 'pokemon': return getPokemonSets();
    case 'magic': return getMagicSets();
    case 'yugioh': return getYugiohSets();
    case 'onepiece': return getOnePieceSets();
    case 'lorcana': return getLorcanaSets();
    case 'starwars': return getStarWarsSets();
    case 'digimon': return getDigimonSets();
    default: return [];
  }
}

// ─── Set Card Loading (browse cards inside a set) ─────

export async function getMagicSetCards(setCode: string): Promise<Card[]> {
  // Scryfall paginates with has_more + next_page
  const allCards: Card[] = [];
  let url: string | null = `${SCRYFALL_API}/cards/search?q=set:${encodeURIComponent(setCode)}&order=set&unique=prints`;

  while (url) {
    const resp: Response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'TCGOracle/1.0.0' },
    });
    if (!resp.ok) break;
    const data: any = await resp.json();
    const cards = (data.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || '',
      imageUrlSmall: c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small || '',
      set: c.set_name || '',
      rarity: c.rarity ? c.rarity.charAt(0).toUpperCase() + c.rarity.slice(1) : '',
      price: c.prices?.usd ? parseFloat(c.prices.usd) : c.prices?.usd_foil ? parseFloat(c.prices.usd_foil) : null,
      priceSource: 'Market',
      game: 'magic' as GameId,
      type: c.type_line || '',
      number: c.collector_number || '',
    }));
    allCards.push(...cards);
    url = data.has_more ? data.next_page : null;
    // Respect Scryfall rate limit (100ms between requests)
    if (url) await new Promise(r => setTimeout(r, 100));
  }

  return allCards;
}

export async function getYugiohSetCards(setCode: string): Promise<Card[]> {
  const resp = await fetch(`${YGOPRO_API}/cardinfo.php?cardset=${encodeURIComponent(setCode)}&num=500&offset=0`);
  if (!resp.ok) return [];
  const data = await resp.json();
  if (data.error) return [];
  return (data.data || []).map((c: any) => {
    const prices = c.card_prices?.[0] || {};
    const bestPrice = parseFloat(prices.tcgplayer_price) || parseFloat(prices.ebay_price) || null;
    return {
      id: String(c.id),
      name: c.name,
      imageUrl: c.card_images?.[0]?.image_url || '',
      imageUrlSmall: c.card_images?.[0]?.image_url_small || '',
      set: setCode,
      rarity: c.card_sets?.find((s: any) => s.set_code?.startsWith(setCode))?.set_rarity || '',
      price: bestPrice && bestPrice > 0 ? bestPrice : null,
      priceSource: 'Market',
      game: 'yugioh' as GameId,
      type: c.type || '',
      number: '',
    };
  });
}

export async function getOnePieceSetCards(setId: string): Promise<Card[]> {
  try {
    const resp = await fetch(`${OPTCG_API}/sets/filtered/?set_id=${encodeURIComponent(setId)}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    const cards = Array.isArray(data) ? data : [];
    return cards.map((c: any) => ({
      id: c.card_set_id || c.card_image_id || String(Math.random()),
      name: c.card_name || '',
      imageUrl: c.card_image || '',
      imageUrlSmall: c.card_image || '',
      set: c.set_name || '',
      rarity: c.rarity || '',
      price: c.market_price || c.inventory_price || null,
      priceSource: 'Market',
      game: 'onepiece' as GameId,
      type: c.card_type || '',
      number: c.card_set_id || '',
    }));
  } catch {
    return [];
  }
}

export async function getSetCards(game: GameId, setId: string, setName?: string): Promise<Card[]> {
  switch (game) {
    case 'pokemon': return getPokemonSetCards(setId);
    case 'magic': return getMagicSetCards(setId);
    case 'yugioh': return getYugiohSetCards(setName || setId);
    case 'onepiece': return getOnePieceSetCards(setId);
    case 'lorcana': return getLorcanaSetCards(setId);
    case 'starwars': return getStarWarsSetCards(setId);
    case 'digimon': return getDigimonSetCards(setId);
    default: return [];
  }
}

// ─── Disney Lorcana (Lorcast API) ─────────────────────

const LORCAST_API = 'https://api.lorcast.com/v0';

export async function searchLorcana(query: string): Promise<SearchResult> {
  const resp = await fetch(`${LORCAST_API}/cards/search?q=${encodeURIComponent(query)}`);
  if (!resp.ok) throw new Error(`Lorcana API: ${resp.status}`);
  const data = await resp.json();
  const cards = data.results || data.data || [];
  return {
    game: 'lorcana',
    total: cards.length,
    cards: cards.slice(0, 20).map((c: any) => ({
      id: c.id || '',
      name: c.version ? `${c.name} - ${c.version}` : c.name || '',
      imageUrl: c.image_uris?.digital?.large || c.image_uris?.digital?.normal || '',
      imageUrlSmall: c.image_uris?.digital?.small || c.image_uris?.digital?.normal || '',
      set: c.set?.name || '',
      rarity: c.rarity || '',
      price: c.prices?.usd || c.prices?.usd_foil || null,
      priceSource: 'Market',
      game: 'lorcana' as GameId,
      type: (c.type || []).join(', '),
      number: c.collector_number || '',
    })),
  };
}

export async function getLorcanaSets(): Promise<CardSet[]> {
  const resp = await fetch(`${LORCAST_API}/sets`);
  if (!resp.ok) throw new Error(`Lorcana Sets API: ${resp.status}`);
  const data = await resp.json();
  const sets = data.results || data.data || data;
  return (Array.isArray(sets) ? sets : []).map((s: any) => ({
    id: s.id || s.code || '',
    name: s.name || '',
    code: s.code || '',
    releaseDate: s.released_at || '',
    totalCards: s.card_count || undefined,
    game: 'lorcana' as GameId,
  })).sort((a: CardSet, b: CardSet) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));
}

export async function getLorcanaSetCards(setId: string): Promise<Card[]> {
  try {
    const resp = await fetch(`${LORCAST_API}/sets/${setId}/cards`);
    if (!resp.ok) return [];
    const data = await resp.json();
    const cards = data.results || data.data || [];
    return cards.map((c: any) => ({
      id: c.id || '',
      name: c.version ? `${c.name} - ${c.version}` : c.name || '',
      imageUrl: c.image_uris?.digital?.large || c.image_uris?.digital?.normal || '',
      imageUrlSmall: c.image_uris?.digital?.small || c.image_uris?.digital?.normal || '',
      set: c.set?.name || '',
      rarity: c.rarity || '',
      price: c.prices?.usd || c.prices?.usd_foil || null,
      priceSource: 'Market',
      game: 'lorcana' as GameId,
      type: (c.type || []).join(', '),
      number: c.collector_number || '',
    }));
  } catch {
    return [];
  }
}

// ─── Star Wars Unlimited (SWU API) ────────────────────

const SWU_API = 'https://api.swuapi.com';

export async function searchStarWars(query: string): Promise<SearchResult> {
  try {
    const resp = await fetch(`${SWU_API}/cards?name=${encodeURIComponent(query)}&limit=20`);
    if (!resp.ok) return { game: 'starwars', total: 0, cards: [] };
    const data = await resp.json();
    const cards = data.cards || [];
    return {
      game: 'starwars',
      total: data.pagination?.total || cards.length,
      cards: cards.slice(0, 20).map((c: any) => ({
        id: c.uuid || c.collector_number || String(c.external_id || Math.random()),
        name: c.subtitle ? `${c.name} - ${c.subtitle}` : c.name || '',
        imageUrl: c.front_image_url || '',
        imageUrlSmall: c.front_image_url || '',
        set: c.set_code || '',
        rarity: c.rarity || '',
        price: undefined,
        priceSource: undefined,
        game: 'starwars' as GameId,
        type: c.type || '',
        number: c.card_number || c.collector_number || '',
      })),
    };
  } catch {
    return { game: 'starwars', total: 0, cards: [] };
  }
}

export async function getStarWarsSets(): Promise<CardSet[]> {
  try {
    const resp = await fetch(`${SWU_API}/sets`);
    if (!resp.ok) return [];
    const data = await resp.json();
    const sets = data.sets || [];
    return sets.map((s: any) => ({
      id: s.code,
      name: s.name,
      code: s.code,
      releaseDate: s.release_date,
      totalCards: s.total_cards,
      game: 'starwars' as GameId,
    })).sort((a: CardSet, b: CardSet) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));
  } catch {
    return [];
  }
}

export async function getStarWarsSetCards(setCode: string): Promise<Card[]> {
  try {
    const resp = await fetch(`${SWU_API}/cards?set=${encodeURIComponent(setCode)}&limit=250`);
    if (!resp.ok) return [];
    const data = await resp.json();
    const cards = data.cards || [];
    return cards.map((c: any) => ({
      id: c.uuid || c.collector_number || String(c.external_id || Math.random()),
      name: c.subtitle ? `${c.name} - ${c.subtitle}` : c.name || '',
      imageUrl: c.front_image_url || '',
      imageUrlSmall: c.front_image_url || '',
      set: c.set_code || setCode,
      rarity: c.rarity || '',
      price: undefined,
      priceSource: undefined,
      game: 'starwars' as GameId,
      type: c.type || '',
      number: c.card_number || c.collector_number || '',
    }));
  } catch {
    return [];
  }
}

// ─── Digimon (digimoncard.io) ─────────────────────────

const DIGIMON_API = 'https://digimoncard.io/api-public';
const DIGIMON_IMG = 'https://images.digimoncard.io/images/cards';

export async function searchDigimon(query: string): Promise<SearchResult> {
  try {
    const resp = await fetch(`${DIGIMON_API}/search?n=${encodeURIComponent(query)}&series=Digimon%20Card%20Game`);
    // API returns 301 redirect sometimes — handle gracefully
    if (!resp.ok && resp.status !== 301) return { game: 'digimon', total: 0, cards: [] };
    const data = await resp.json();
    if (!Array.isArray(data)) return { game: 'digimon', total: 0, cards: [] };
    return {
      game: 'digimon',
      total: data.length,
      cards: data.slice(0, 20).map((c: any) => ({
        id: c.id || '',
        name: c.name || '',
        imageUrl: c.id ? `${DIGIMON_IMG}/${c.id}.jpg` : '',
        imageUrlSmall: c.id ? `${DIGIMON_IMG}/${c.id}.jpg` : '',
        set: Array.isArray(c.set_name) ? c.set_name[0] || '' : c.set_name || '',
        rarity: c.rarity || '',
        price: undefined,
        priceSource: undefined,
        game: 'digimon' as GameId,
        type: c.type || '',
        number: c.id || '',
      })),
    };
  } catch {
    return { game: 'digimon', total: 0, cards: [] };
  }
}

export async function getDigimonSets(): Promise<CardSet[]> {
  // digimoncard.io doesn't have a dedicated sets endpoint.
  // We use a hardcoded list of the most popular booster sets.
  const knownSets = [
    { id: 'BT-01', name: 'BT-01: New Evolution', code: 'BT01' },
    { id: 'BT-02', name: 'BT-02: Ultimate Power', code: 'BT02' },
    { id: 'BT-03', name: 'BT-03: Union Impact', code: 'BT03' },
    { id: 'BT-04', name: 'BT-04: Great Legend', code: 'BT04' },
    { id: 'BT-05', name: 'BT-05: Battle of Omni', code: 'BT05' },
    { id: 'BT-06', name: 'BT-06: Double Diamond', code: 'BT06' },
    { id: 'BT-07', name: 'BT-07: Next Adventure', code: 'BT07' },
    { id: 'BT-08', name: 'BT-08: New Awakening', code: 'BT08' },
    { id: 'BT-09', name: 'BT-09: X Record', code: 'BT09' },
    { id: 'BT-10', name: 'BT-10: Xros Encounter', code: 'BT10' },
    { id: 'BT-11', name: 'BT-11: Dimensional Phase', code: 'BT11' },
    { id: 'BT-12', name: 'BT-12: Across Time', code: 'BT12' },
    { id: 'BT-13', name: 'BT-13: Versus Royal Knights', code: 'BT13' },
    { id: 'BT-14', name: 'BT-14: Blast Ace', code: 'BT14' },
    { id: 'BT-15', name: 'BT-15: Exceed Apocalypse', code: 'BT15' },
    { id: 'BT-16', name: 'BT-16: Beginning Observer', code: 'BT16' },
    { id: 'BT-17', name: 'BT-17: Secret Crisis', code: 'BT17' },
    { id: 'BT-18', name: 'BT-18: Infinite Bond', code: 'BT18' },
    { id: 'BT-19', name: 'BT-19: Imperious Proof', code: 'BT19' },
    { id: 'EX-01', name: 'EX-01: Classic Collection', code: 'EX01' },
    { id: 'EX-02', name: 'EX-02: Digital Hazard', code: 'EX02' },
    { id: 'EX-03', name: 'EX-03: Draconic Roar', code: 'EX03' },
    { id: 'EX-04', name: 'EX-04: Alternative Being', code: 'EX04' },
    { id: 'EX-05', name: 'EX-05: Animal Colosseum', code: 'EX05' },
    { id: 'EX-06', name: 'EX-06: Infernal Ascension', code: 'EX06' },
    { id: 'EX-07', name: 'EX-07: Digimon Liberator', code: 'EX07' },
    { id: 'RB-01', name: 'RB-01: Resurgence Booster', code: 'RB01' },
  ].reverse(); // Most recent first

  return knownSets.map(s => ({
    ...s,
    game: 'digimon' as GameId,
  }));
}

export async function getDigimonSetCards(setId: string): Promise<Card[]> {
  try {
    // Search by pack name using the set ID prefix (e.g., "BT-01" → "BT-01:")
    const resp = await fetch(`${DIGIMON_API}/search?pack=${encodeURIComponent(setId)}&series=Digimon%20Card%20Game`);
    if (!resp.ok) return [];
    const data = await resp.json();
    if (!Array.isArray(data)) return [];
    return data.map((c: any) => ({
      id: c.id || '',
      name: c.name || '',
      imageUrl: c.id ? `${DIGIMON_IMG}/${c.id}.jpg` : '',
      imageUrlSmall: c.id ? `${DIGIMON_IMG}/${c.id}.jpg` : '',
      set: Array.isArray(c.set_name) ? c.set_name[0] || '' : c.set_name || '',
      rarity: c.rarity || '',
      price: undefined,
      priceSource: undefined,
      game: 'digimon' as GameId,
      type: c.type || '',
      number: c.id || '',
    }));
  } catch {
    return [];
  }
}

// ─── Price History API (Vercel KV) ──────────────────────

export interface HistoricalPrice {
  date: string;   // "2026-04-03"
  market: number;
  low?: number;
  high?: number;
}

const HISTORY_API = 'https://the-undesirables.com/api/v1/history';

/**
 * Fetch historical price data for a card from the Vercel KV pipeline.
 * Returns empty array on failure (chart falls back to eBay comp mode).
 */
export async function fetchPriceHistory(
  cardName: string,
  game?: GameId,
  days: number = 365
): Promise<HistoricalPrice[]> {
  try {
    const params = new URLSearchParams({
      name: cardName,
      days: String(days),
    });
    if (game && game !== 'ebay') {
      params.set('game', game);
    }

    const resp = await fetch(`${HISTORY_API}?${params}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) return [];

    const data = await resp.json();

    // Direct product lookup returns history array
    if (data.history && Array.isArray(data.history)) {
      return data.history.map((h: any) => ({
        date: h.date,
        market: h.price || h.market || 0,
        low: h.low,
        high: h.high,
      }));
    }

    // Name search returns results with product_ids — fetch first match
    if (data.results && data.results.length > 0) {
      const firstResult = data.results[0];
      if (firstResult.product_id) {
        const detailResp = await fetch(
          `${HISTORY_API}?product_id=${firstResult.product_id}&days=${days}`,
          {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (detailResp.ok) {
          const detailData = await detailResp.json();
          if (detailData.history && Array.isArray(detailData.history)) {
            return detailData.history.map((h: any) => ({
              date: h.date,
              market: h.price || h.market || 0,
              low: h.low,
              high: h.high,
            }));
          }
        }
      }
    }

    return [];
  } catch {
    // Silently fail — chart will use eBay comp mode instead
    return [];
  }
}
