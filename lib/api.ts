/**
 * TCG Oracle — Clean API Client
 * 4 Free, Legally Clear APIs:
 *   - Pokémon TCG API (pokemontcg.io)
 *   - Scryfall (Magic: The Gathering)
 *   - YGOProDeck (Yu-Gi-Oh!)
 *   - OPTCG API (One Piece)
 * 
 * Zero TCGCSV dependency.
 */

// ─── Types ────────────────────────────────────────────

export type GameId = 'pokemon' | 'magic' | 'yugioh' | 'onepiece' | 'lorcana' | 'ebay';

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
  const resp = await fetch(`${POKEMON_API}/cards?q=set.id:${setId}&pageSize=100&orderBy=number`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Pokémon Cards API: ${resp.status}`);
  const data = await resp.json();
  return (data.data || []).map((c: any) => ({
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
    }
  }

  // Search all games in parallel
  const results = await Promise.allSettled([
    searchPokemon(query),
    searchMagic(query),
    searchYugioh(query),
    searchOnePiece(query),
    searchLorcana(query),
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
    default: return [];
  }
}

// ─── Set Card Loading (browse cards inside a set) ─────

export async function getMagicSetCards(setCode: string): Promise<Card[]> {
  const resp = await fetch(`${SCRYFALL_API}/cards/search?q=set:${encodeURIComponent(setCode)}&order=set&unique=prints`, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'TCGOracle/1.0.0' },
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.data || []).slice(0, 100).map((c: any) => ({
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
}

export async function getYugiohSetCards(setCode: string): Promise<Card[]> {
  const resp = await fetch(`${YGOPRO_API}/cardinfo.php?cardset=${encodeURIComponent(setCode)}&num=100&offset=0`);
  if (!resp.ok) return [];
  const data = await resp.json();
  if (data.error) return [];
  return (data.data || []).slice(0, 100).map((c: any) => {
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
    return cards.slice(0, 100).map((c: any) => ({
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
    return cards.slice(0, 100).map((c: any) => ({
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
