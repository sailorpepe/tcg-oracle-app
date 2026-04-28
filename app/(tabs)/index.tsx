import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  TextInput,
  Animated,
  Platform,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';
import { GAMES, getSets, getSetCards, searchCards, GameId, GameInfo, CardSet, Card } from '@/lib/api';
import { addToVault } from '@/lib/vault';
import ScreenTitle from '@/components/ScreenTitle';
import { decryptEbayCredentials, hasSecureCredentials } from '@/lib/crypto-utils';
import { executeEbayFetch } from '@/lib/ebay-worker';

// PIN retrieval — checks session-only storage first, falls back to legacy persistent key
const getSessionPin = (): string => {
  if (typeof window === 'undefined') return '1234';
  // 1. Check session storage (preferred — ephemeral)
  const sessionPin = window.sessionStorage?.getItem('@tcg_oracle_session_pin');
  if (sessionPin) return sessionPin;
  // 2. Fall back to legacy persistent storage (from before the security upgrade)
  const legacyPin = window.localStorage?.getItem('@tcg_oracle_cached_pin');
  if (legacyPin) {
    // Migrate to session storage for this session
    window.sessionStorage?.setItem('@tcg_oracle_session_pin', legacyPin);
    return legacyPin;
  }
  return '1234';
};
import WallpaperBackground from '@/components/WallpaperBackground';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ViewMode = 'home' | 'sets' | 'cards' | 'results' | 'card-details';

export default function IndexScreen() {
  const { theme } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [selectedGame, setSelectedGame] = useState<GameInfo | null>(null);
  const [sets, setSets] = useState<CardSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<CardSet | null>(null);
  const [setCards, setSetCards] = useState<Card[]>([]);
  const [trendingCards, setTrendingCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  
  // eBay Comps
  const [comps, setComps] = useState<any[]>([]);
  const [clResult, setClResult] = useState<any>(null);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compsError, setCompsError] = useState('');

  // Helper: get BYOK credentials if user has set them up (optional override)
  const getBYOKCredentials = async (): Promise<{appId: string, secret: string} | null> => {
    try {
      const has = await hasSecureCredentials();
      if (!has) return null;
      const pin = getSessionPin();
      return await decryptEbayCredentials(pin);
    } catch { return null; }
  };

  // Search state (merged from Market)
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeFilter, setActiveFilter] = useState<GameId | 'all' | 'ebay'>('all');
  const [totalResults, setTotalResults] = useState(0);
  const [trendingLoading, setTrendingLoading] = useState(false);

  // Signature queries — each game gets its most iconic card for trending
  const SIGNATURE_QUERIES: Record<GameId | 'all' | 'ebay', { term: string; game?: GameId }> = {
    all: { term: 'Charizard', game: 'pokemon' },
    pokemon: { term: 'Charizard', game: 'pokemon' },
    magic: { term: 'Lotus', game: 'magic' },
    yugioh: { term: 'Dark Magician', game: 'yugioh' },
    onepiece: { term: 'Luffy', game: 'onepiece' },
    lorcana: { term: 'Elsa', game: 'lorcana' },
    ebay: { term: 'sports trading card' },
  };

  // Toast
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ message });
    Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    toastTimeout.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setToast(null));
    }, 1800);
  };

  // Load trending on mount
  useEffect(() => { loadTrending('all'); }, []);

  const loadTrending = async (filter: GameId | 'all' | 'ebay') => {
    setTrendingLoading(true);
    try {
      const sig = SIGNATURE_QUERIES[filter];
      if (filter === 'ebay') {
        // Use BYOK if available, otherwise proxy handles it server-side
        const creds = await getBYOKCredentials();
        const ebayData = await executeEbayFetch(creds?.appId, creds?.secret, sig.term, true);
        if (ebayData && ebayData.itemSummaries) {
           const ebayCards = ebayData.itemSummaries.map((item: any) => ({
               id: item.itemId,
               name: item.title,
               imageUrl: item.image?.imageUrl || '',
               imageUrlSmall: item.image?.imageUrl || '',
               set: 'eBay',
               price: parseFloat(item.price?.value || '0'),
               priceSource: 'eBay',
               game: 'ebay' as GameId,
           }));
           setTrendingCards(ebayCards.slice(0, 8));
        } else {
           setTrendingCards([]);
        }
      } else {
        const result = await searchCards(sig.term, sig.game);
        setTrendingCards(result.cards.slice(0, 8));
      }
    } catch (e) {
      console.warn("Trending fetch failed", e);
      setTrendingCards([]); 
    }
    setTrendingLoading(false);
  };

  // When a filter pill is tapped, reload trending AND set the search filter
  const handleFilterChange = (filter: GameId | 'all' | 'ebay') => {
    setActiveFilter(filter);
    // Only reload trending if we're on the home view
    if (viewMode === 'home') {
      loadTrending(filter);
    }
  };

  const selectGame = async (game: GameInfo) => {
    setSelectedGame(game);
    setViewMode('sets');
    setLoading(true);
    try { setSets(await getSets(game.id)); }
    catch { setSets([]); }
    setLoading(false);
  };

  const selectSet = async (set: CardSet) => {
    if (!selectedGame) return;
    setSelectedSet(set);
    setViewMode('cards');
    setLoading(true);
    try { setSetCards(await getSetCards(selectedGame.id, set.id, set.name)); }
    catch { setSetCards([]); }
    setLoading(false);
  };

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearchLoading(true);
    setSearched(true);
    setViewMode('results');
    try {
      if (activeFilter === 'ebay') {
          const creds = await getBYOKCredentials();
          const ebayData = await executeEbayFetch(creds?.appId, creds?.secret, query.trim(), false);
          if (ebayData && ebayData.itemSummaries) {
              const ebayCards = ebayData.itemSummaries.map((item: any) => ({
                 id: item.itemId,
                 name: item.title,
                 imageUrl: item.image?.imageUrl || '',
                 imageUrlSmall: item.image?.imageUrl || '',
                 set: 'eBay',
                 price: parseFloat(item.price?.value || '0'),
                 priceSource: 'eBay',
                 game: 'ebay' as GameId,
             }));
             setResults(ebayCards);
             setTotalResults(ebayCards.length);
          } else {
             setResults([]);
             setTotalResults(0);
          }
      } else {
          const game = activeFilter === 'all' ? undefined : (activeFilter as GameId);
          const data = await searchCards(query.trim(), game);
          setResults(data.cards);
          setTotalResults(data.total);
      }
    } catch (err: any) {
      if (activeFilter === 'ebay') {
        showToast(err.message || 'Failed to fetch eBay data.');
      }
      setResults([]);
      setTotalResults(0);
    }
    setSearchLoading(false);
  }, [query, activeFilter]);

  // Debounced live search
  useEffect(() => {
    const handler = setTimeout(() => {
      if (query.trim().length >= 3) {
        doSearch();
      } else if (query.trim().length === 0 && viewMode === 'results') {
        goBack(); // If cleared, go back to home
      }
    }, 700);
    return () => clearTimeout(handler);
  }, [query]);

  const handleSaveToVault = async (card: Card) => {
    const { added, alreadyExists } = await addToVault(card);
    if (added) showToast(`SYS: ${card.name.substring(0, 24)} secured to Vault`);
    else if (alreadyExists) showToast('SYS: Asset already in Vault');
  };

  const goBack = () => {
    if (viewMode === 'card-details') {
      setViewMode(searched ? 'results' : (selectedSet ? 'cards' : 'home'));
      setSelectedCard(null);
      setComps([]);
      setClResult(null);
    }
    else if (viewMode === 'cards') { setViewMode('sets'); setSelectedSet(null); setSetCards([]); }
    else if (viewMode === 'sets') { setViewMode('home'); setSelectedGame(null); }
    else if (viewMode === 'results') { setViewMode('home'); setSearched(false); setResults([]); }
  };

  const openCardDetails = async (card: Card) => {
    setSelectedCard(card);
    setViewMode('card-details');
    setCompsLoading(true);
    setCompsError('');
    try {
      // Use BYOK if available, otherwise proxy handles auth server-side
      const creds = await getBYOKCredentials();
      
      // Build precision query using card name + set + collector number
      const query = card.name.trim();
      const setName = card.game !== 'ebay' ? (card.set || undefined) : undefined;
      const cardNumber = card.number || undefined;
      
      // Execute fetch with precision identifiers
      let ebayData = await executeEbayFetch(creds?.appId, creds?.secret, query, false, setName, cardNumber);
      
      // If no results with precision query, fall back to just card name
      if (!ebayData?.clResult && !ebayData?.itemSummaries?.length) {
          ebayData = await executeEbayFetch(creds?.appId, creds?.secret, query, false);
      }
      
      if (ebayData && ebayData.clResult) {
          setClResult(ebayData.clResult);
          setComps(ebayData.clResult.comps || []);
      } else {
          setComps([]);
      }
    } catch (e: any) {
      setCompsError(e.message || 'Failed to fetch live comps');
    }
    setCompsLoading(false);
  };

  // ─── Filters ────────────────────────────────
  const filters = [
    { id: 'all' as const, label: 'All', code: '◉' },
    ...GAMES.map(g => ({ id: g.id, label: g.name, code: g.emoji })),
    { id: 'ebay' as const, label: 'eBay Live', code: '🛒' },
  ];

  // ─── Card Result Row (shared) ───────────────
  const renderResultRow = ({ item }: { item: Card }) => {
    const gameInfo = GAMES.find(g => g.id === item.game);
    return (
      <TouchableOpacity 
        style={[styles.resultRow, { borderBottomColor: theme.border }]}
        activeOpacity={0.7}
        onPress={() => openCardDetails(item)}
      >
        {item.imageUrlSmall ? (
          <Image source={{ uri: item.imageUrlSmall }} style={styles.cardImage} resizeMode="contain" />
        ) : (
          <View style={[styles.cardImagePlaceholder, { backgroundColor: theme.surfaceElevated }]}>
            <Text style={styles.cardPlaceholderText}>{gameInfo?.emoji || '▣'}</Text>
          </View>
        )}
        <View style={styles.resultInfo}>
          <Text style={[styles.resultName, { color: theme.textPrimary }]} numberOfLines={2}>{item.name}</Text>
          <Text style={[styles.resultMeta, { color: theme.textMuted }]}>
            {item.game === 'ebay' ? '🛒' : gameInfo?.emoji} {item.set}
          </Text>
          {item.rarity ? (
            <Text style={[styles.resultRarity, { color: theme.textSecondary }]}>{item.rarity}</Text>
          ) : null}
        </View>
        <View style={styles.resultRight}>
          {item.price != null ? (
            <>
              <Text style={[styles.resultPrice, { color: theme.accent }]}>${item.price.toFixed(2)}</Text>
              <Text style={[styles.priceLabel, { color: theme.textDim }]}>MARKET</Text>
            </>
          ) : (
            <Text style={[styles.noPrice, { color: theme.textDim }]}>—</Text>
          )}
          <TouchableOpacity
            onPress={() => handleSaveToVault(item)}
            style={[styles.saveBtn, { borderColor: theme.border }]}
            activeOpacity={0.6}
          >
            <Text style={[styles.saveBtnText, { color: theme.accent }]}>+</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Game Selector ──────────────────────────
  const renderGameCard = ({ item }: { item: GameInfo }) => (
    <TouchableOpacity
      style={[styles.gameCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      activeOpacity={0.7}
      onPress={() => selectGame(item)}
    >
      <Text style={styles.gameEmoji}>{item.emoji}</Text>
      <Text style={[styles.gameName, { color: theme.textPrimary }]}>{item.name}</Text>
      <Text style={[styles.gameDesc, { color: theme.textMuted }]}>{item.description}</Text>
      <View style={[styles.gameAccent, { backgroundColor: item.color }]} />
    </TouchableOpacity>
  );

  // ─── Set Browser ────────────────────────────
  const renderSetRow = ({ item }: { item: CardSet }) => (
    <TouchableOpacity
      style={[styles.setRow, { borderBottomColor: theme.border }]}
      activeOpacity={0.7}
      onPress={() => selectSet(item)}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.setImage} resizeMode="contain" />
      ) : (
        <View style={[styles.setImagePlaceholder, { backgroundColor: theme.surfaceElevated }]}>
          <Text style={styles.setPlaceholderText}>{selectedGame?.emoji || '▣'}</Text>
        </View>
      )}
      <View style={styles.setInfo}>
        <Text style={[styles.setName, { color: theme.textPrimary }]} numberOfLines={1}>{item.name}</Text>
        <View style={styles.setMeta}>
          {item.code && <Text style={[styles.setCode, { color: theme.accent }]}>{item.code}</Text>}
          {item.totalCards != null && <Text style={[styles.setDetail, { color: theme.textMuted }]}>{item.totalCards} cards</Text>}
          {item.releaseDate && <Text style={[styles.setDetail, { color: theme.textMuted }]}>{item.releaseDate}</Text>}
        </View>
      </View>
      <Text style={[styles.setChevron, { color: theme.textDim }]}>›</Text>
    </TouchableOpacity>
  );

  // ─── Trending Card ──────────────────────────
  const renderTrendingCard = ({ item }: { item: Card }) => (
    <TouchableOpacity
      style={[styles.trendCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      activeOpacity={0.7}
      onPress={() => openCardDetails(item)}
    >
      {item.imageUrlSmall ? (
        <Image source={{ uri: item.imageUrlSmall }} style={styles.trendImage} resizeMode="contain" />
      ) : null}
      <Text style={[styles.trendName, { color: theme.textPrimary }]} numberOfLines={2}>{item.name}</Text>
      {item.price != null && (
        <Text style={[styles.trendPrice, { color: theme.accent }]}>${item.price.toFixed(2)}</Text>
      )}
    </TouchableOpacity>
  );

  // ─── Search Bar (always visible) ────────────
  const renderSearchBar = () => (
    <View style={styles.searchSection}>
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
          placeholder={`Query ${activeFilter === 'all' ? 'the index' : filters.find(f => f.id === activeFilter)?.label}...`}
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={doSearch}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.searchBtn, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow }]}
          onPress={doSearch}
        >
          <Text style={[styles.searchBtnText, { color: theme.accent }]}>⌕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[
              styles.filterPill,
              { backgroundColor: theme.surface, borderColor: theme.border },
              activeFilter === f.id && { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow },
            ]}
            onPress={() => handleFilterChange(f.id)}
          >
            <Text style={[styles.filterCode, activeFilter === f.id ? { color: theme.accent } : { color: theme.textMuted }]}>
              {f.code}
            </Text>
            <Text style={[
              styles.filterLabel,
              { color: theme.textMuted },
              activeFilter === f.id && { color: theme.accent },
            ]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ─── Header (WITHOUT search bar — search bar is rendered separately to avoid focus loss) ─────
  const renderHeader = () => {
    if (viewMode === 'sets' && selectedGame) {
      return (
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={[styles.backText, { color: theme.accent }]}>← BACK</Text>
          </TouchableOpacity>
          <ScreenTitle title={selectedGame.name} subtitle={`${sets.length} expansion sets indexed`} />
        </View>
      );
    }

    if (viewMode === 'cards' && selectedSet) {
      return (
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={[styles.backText, { color: theme.accent }]}>← {selectedGame?.name?.toUpperCase() || 'BACK'}</Text>
          </TouchableOpacity>
          <ScreenTitle title={selectedSet.name} subtitle={`${setCards.length} cards loaded${selectedSet.code ? ` · ${selectedSet.code}` : ''}`} />
        </View>
      );
    }

    if (viewMode === 'results') {
      return (
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={[styles.backText, { color: theme.accent }]}>← BACK</Text>
          </TouchableOpacity>
          <ScreenTitle title="Results" subtitle={`${totalResults} assets matched`} />
        </View>
      );
    }
    
    if (viewMode === 'card-details' && selectedCard) {
      const validCount = comps.filter(c => !c.isOutlier).length;
      const outlierCount = comps.filter(c => c.isOutlier).length;
      return (
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={[styles.backText, { color: theme.accent }]}>← BACK</Text>
          </TouchableOpacity>

          {/* Hero Card Image */}
          <View style={styles.heroCardSection}>
            {selectedCard.imageUrl ? (
              <Image 
                source={{ uri: selectedCard.imageUrl }} 
                style={styles.heroCardImage} 
                resizeMode="contain" 
              />
            ) : (
              <View style={[styles.heroCardPlaceholder, { backgroundColor: theme.surfaceElevated }]}>
                <Text style={{ fontSize: 48 }}>{GAMES.find(g => g.id === selectedCard.game)?.emoji || '▣'}</Text>
              </View>
            )}
            <Text style={[styles.heroCardName, { color: theme.textPrimary }]} numberOfLines={2}>
              {selectedCard.name}
            </Text>
            <View style={styles.heroMetaRow}>
              <Text style={[styles.heroMetaTag, { color: theme.accent, borderColor: theme.accent }]}>
                {selectedCard.game === 'ebay' ? 'eBay Live' : (GAMES.find(g => g.id === selectedCard.game)?.name || selectedCard.game)}
              </Text>
              {selectedCard.set ? (
                <Text style={[styles.heroMetaTag, { color: theme.textMuted, borderColor: theme.border }]}>
                  {selectedCard.set}
                </Text>
              ) : null}
              {selectedCard.rarity ? (
                <Text style={[styles.heroMetaTag, { color: theme.textSecondary, borderColor: theme.border }]}>
                  {selectedCard.rarity}
                </Text>
              ) : null}
            </View>
            {selectedCard.price != null && (
              <View style={styles.heroApiPriceRow}>
                <Text style={[styles.heroApiPriceLabel, { color: theme.textDim }]}>
                  {selectedCard.priceSource || 'MARKET'} PRICE
                </Text>
                <Text style={[styles.heroApiPrice, { color: theme.textPrimary }]}>
                  ${selectedCard.price.toFixed(2)}
                </Text>
              </View>
            )}
            
            {/* Save to Vault — prominent action button */}
            <TouchableOpacity
              style={[styles.heroSaveBtn, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow }]}
              onPress={() => handleSaveToVault(selectedCard)}
              activeOpacity={0.7}
            >
              <Text style={[styles.heroSaveBtnText, { color: theme.accent }]}>+ SAVE TO VAULT</Text>
            </TouchableOpacity>
          </View>
          
          {/* CL Value Panel */}
          {clResult && (
            <View style={[styles.clValueContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
               <Text style={[styles.clValueLabel, { color: theme.textMuted }]}>TRUE CL VALUE</Text>
               <Text style={[styles.clValueAmount, { color: theme.accent }]}>
                 ${clResult.clValue.toFixed(2)}
               </Text>
               
               <View style={styles.marginRow}>
                 <View style={styles.marginBox}>
                   <Text style={[styles.marginLabel, { color: theme.textDim }]}>CASH BUY</Text>
                   <Text style={[styles.marginValue, { color: '#4ade80' }]}>${clResult.cashBuy.toFixed(2)}</Text>
                   <Text style={[styles.marginPct, { color: theme.textDim }]}>65%</Text>
                 </View>
                 <View style={[styles.marginBox, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.border }]}>
                   <Text style={[styles.marginLabel, { color: theme.textDim }]}>TRADE</Text>
                   <Text style={[styles.marginValue, { color: '#60a5fa' }]}>${clResult.tradeCredit.toFixed(2)}</Text>
                   <Text style={[styles.marginPct, { color: theme.textDim }]}>80%</Text>
                 </View>
                 <View style={styles.marginBox}>
                   <Text style={[styles.marginLabel, { color: theme.textDim }]}>RETAIL</Text>
                   <Text style={[styles.marginValue, { color: theme.textPrimary }]}>${clResult.retail.toFixed(2)}</Text>
                   <Text style={[styles.marginPct, { color: theme.textDim }]}>100%</Text>
                 </View>
               </View>

               {clResult.isSpike && (
                 <View style={[styles.alertBox, { backgroundColor: 'rgba(255, 69, 0, 0.1)', borderColor: '#ff4500' }]}>
                   <Text style={[styles.alertText, { color: '#ff4500' }]}>⚠️ MOMENTUM SPIKE DETECTED</Text>
                 </View>
               )}
               {clResult.lowLiquidity && (
                 <View style={[styles.alertBox, { backgroundColor: 'rgba(255, 215, 0, 0.1)', borderColor: '#ffd700' }]}>
                   <Text style={[styles.alertText, { color: '#ffd700' }]}>⚠️ LOW LIQUIDITY - Verify manually</Text>
                 </View>
               )}
            </View>
          )}

          {/* Methodology Breakdown */}
          {clResult && (
            <View style={[styles.methodologyBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.methodologyTitle, { color: theme.accent }]}>◈ HOW CL VALUE WAS CALCULATED</Text>
              <View style={styles.methodologySteps}>
                <Text style={[styles.methodStep, { color: theme.textSecondary }]}>
                  1. Pulled {comps.length} recent eBay listings for "{selectedCard.name}"
                </Text>
                <Text style={[styles.methodStep, { color: theme.textSecondary }]}>
                  2. Filtered proxies, oricas, digital copies, and art cards
                </Text>
                <Text style={[styles.methodStep, { color: theme.textSecondary }]}>
                  3. Applied landed cost (price + shipping, capped at $5 ship)
                </Text>
                {clResult.usedRawOnly && clResult.gradedCount > 0 && (
                  <Text style={[styles.methodStep, { color: '#60a5fa' }]}>
                    ★ Excluded {clResult.gradedCount} GRADED listings (PSA/BGS/CGC/SGC) — using {clResult.rawCount} RAW comps only
                  </Text>
                )}
                {!clResult.usedRawOnly && clResult.gradedCount > 0 && (
                  <Text style={[styles.methodStep, { color: '#ffd700' }]}>
                    ⚠ Not enough raw comps ({clResult.rawCount}) — includes graded cards in calculation
                  </Text>
                )}
                <Text style={[styles.methodStep, { color: theme.textSecondary }]}>
                  {comps.filter(c => c.isBestOffer).length > 0 
                    ? `4. ${comps.filter(c => c.isBestOffer).length} Best Offer listing(s) penalized 15%`
                    : '4. No Best Offer adjustments needed'}
                </Text>
                <Text style={[styles.methodStep, { color: theme.textSecondary }]}>
                  5. Trimmed top/bottom 15% outliers ({outlierCount} removed, {validCount} valid)
                </Text>
                <Text style={[styles.methodStep, { color: theme.textSecondary }]}>
                  6. Time-decay weighted average (recent sales count 1.5× more)
                </Text>
                {clResult.clValue <= 3.00 && (
                  <Text style={[styles.methodStep, { color: '#ffd700' }]}>
                    7. Bulk floor override: Cash buy set to $0.10 (CL ≤ $3.00)
                  </Text>
                )}
              </View>
            </View>
          )}

          <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: Spacing.xl }]}>
            ◈ ACTIVE LISTINGS ({validCount} valid / {comps.length} total)
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.header}>
        <ScreenTitle title="Index" subtitle="Cross-system market telemetry" showGear />
        {/* eBay works out of the box via server proxy — no setup needed */}

        {/* Trending */}
        <View style={styles.trendingSection}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
            ▲ HIGH VELOCITY{activeFilter !== 'all' ? ` · ${GAMES.find(g => g.id === activeFilter)?.name?.toUpperCase() || ''}` : ''}
          </Text>
          {trendingLoading ? (
            <View style={styles.trendingLoadingBox}>
              <ActivityIndicator size="small" color={theme.accent} />
            </View>
          ) : trendingCards.length > 0 ? (
            <FlatList
              data={trendingCards}
              renderItem={renderTrendingCard}
              keyExtractor={(item, i) => `${item.game}-${item.id}-${i}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingList}
            />
          ) : (
            <Text style={[styles.emptyHint, { color: theme.textDim }]}>No trending data for this system</Text>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: Spacing.xl }]}>◈ SYSTEMS</Text>
      </View>
    );
  };

  // ─── Main Render ────────────────────────────
  const getListData = () => {
    if (viewMode === 'results') return results;
    if (viewMode === 'sets') return sets;
    return GAMES;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <WallpaperBackground />
      <StatusBar barStyle={theme.statusBar} />

      {/* Search bar outside FlatList to prevent focus loss on re-render */}
      {(viewMode === 'home' || viewMode === 'results') && renderSearchBar()}

      {viewMode === 'home' ? (
        <FlatList
          key="home-grid"
          ListHeaderComponent={renderHeader}
          data={GAMES}
          renderItem={renderGameCard}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gameRow}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      ) : viewMode === 'sets' ? (
        <FlatList
          key="sets-list"
          ListHeaderComponent={renderHeader}
          data={sets}
          renderItem={renderSetRow}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={[styles.loadingText, { color: theme.textMuted }]}>Indexing expansion data...</Text>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>No expansion data available</Text>
              </View>
            )
          }
        />
      ) : viewMode === 'cards' ? (
        <FlatList
          key="cards-list"
          ListHeaderComponent={renderHeader}
          data={setCards}
          renderItem={renderResultRow}
          keyExtractor={(item, i) => `${item.game}-${item.id}-${i}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading cards...</Text>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>No card data available for this set</Text>
              </View>
            )
          }
        />
      ) : viewMode === 'results' ? (
        <FlatList
          key="results-list"
          ListHeaderComponent={renderHeader}
          data={results}
          renderItem={renderResultRow}
          keyExtractor={(item, i) => `${item.game}-${item.id}-${i}`}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            searchLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={[styles.loadingText, { color: theme.textMuted }]}>
                  Querying {activeFilter === 'all' ? 'all systems' : GAMES.find(g => g.id === activeFilter)?.name}...
                </Text>
              </View>
            ) : searched ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No assets matched query</Text>
                <Text style={[styles.emptyHint, { color: theme.textMuted }]}>Adjust search term or system filter</Text>
              </View>
            ) : null
          }
        />
      ) : viewMode === 'card-details' && selectedCard ? (
        <FlatList
          key="card-details-list"
          ListHeaderComponent={renderHeader}
          data={comps}
          renderItem={({ item }) => (
            <View style={[styles.compRow, { borderBottomColor: theme.border, opacity: item.isOutlier ? 0.3 : 1 }]}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.compImage} resizeMode="cover" />
              ) : (
                <View style={[styles.compImage, { backgroundColor: theme.surfaceElevated }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.compTitle, { color: theme.textPrimary, textDecorationLine: item.isOutlier ? 'line-through' : 'none' }]} numberOfLines={2}>{item.title}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Text style={[styles.compMeta, { color: theme.textMuted, marginTop: 0 }]}>
                     {item.dateSold.toLocaleDateString()}
                  </Text>
                  {item.isBestOffer && (
                    <Text style={{ fontSize: 9, color: '#fbbf24', fontWeight: '700' }}>BEST OFFER</Text>
                  )}
                  {item.isGraded ? (
                    <Text style={{ fontSize: 9, color: '#f87171', fontWeight: '800', borderWidth: 1, borderColor: '#f87171', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>GRADED</Text>
                  ) : (
                    <Text style={{ fontSize: 9, color: '#4ade80', fontWeight: '700', borderWidth: 1, borderColor: '#4ade80', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>RAW</Text>
                  )}
                  {item.isOutlier && (
                    <Text style={{ fontSize: 9, color: '#f87171', fontWeight: '700' }}>EXCLUDED</Text>
                  )}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.compPrice, { color: item.isGraded ? '#f87171' : theme.accent, textDecorationLine: item.isOutlier ? 'line-through' : 'none' }]}>
                  ${item.totalCost?.toFixed(2)}
                </Text>
                <Text style={[styles.priceLabel, { color: theme.textDim }]}>W/ SHIP</Text>
              </View>
            </View>
          )}
          keyExtractor={(item, i) => `comp-${i}`}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            compsLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={theme.accent} />
                <Text style={[styles.loadingText, { color: theme.textMuted }]}>Fetching Live Comps from eBay...</Text>
              </View>
            ) : compsError ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>eBay API Error</Text>
                <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{compsError}</Text>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No live comps found</Text>
              </View>
            )
          }
        />
      ) : null}

      {/* Toast */}
      {toast && (
        <Animated.View
          style={[
            styles.toast,
            {
              backgroundColor: theme.accentMuted,
              borderColor: theme.borderGlow,
              opacity: toastOpacity,
            },
          ]}
        >
          <Text style={[styles.toastText, { color: theme.accent }]}>{toast.message}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingBottom: 30 },
  header: { padding: Spacing.xl },

  // Back
  backButton: { marginBottom: Spacing.sm },
  backText: { fontSize: FontSizes.sm, fontWeight: '700', letterSpacing: 1 },

  // Search
  searchSection: { marginTop: Spacing.lg },
  searchRow: { flexDirection: 'row', gap: Spacing.sm },
  searchInput: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.md,
    letterSpacing: 0.3,
  },
  searchBtn: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
  },
  searchBtnText: { fontSize: 20, fontWeight: '300' },

  // Filters
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
  },
  filterCode: { fontSize: 12 },
  filterLabel: { fontSize: FontSizes.xs, fontWeight: '600' },

  // Section labels
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },

  // Game cards
  gameRow: { paddingHorizontal: Spacing.xl, gap: Spacing.md },
  gameCard: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  gameEmoji: { fontSize: 36 },
  gameName: { fontSize: FontSizes.lg, fontWeight: '800' },
  gameDesc: { fontSize: FontSizes.xs, textAlign: 'center' },
  gameAccent: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 3,
    borderBottomLeftRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
  },

  // Set rows
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    gap: Spacing.md,
  },
  setImage: { width: 40, height: 40, borderRadius: 4 },
  setImagePlaceholder: {
    width: 40, height: 40, borderRadius: 4,
    justifyContent: 'center', alignItems: 'center',
  },
  setPlaceholderText: { fontSize: 18 },
  setInfo: { flex: 1 },
  setName: { fontSize: FontSizes.sm, fontWeight: '600' },
  setMeta: { flexDirection: 'row', gap: Spacing.sm, marginTop: 2, flexWrap: 'wrap' },
  setCode: { fontSize: FontSizes.xs, fontWeight: '700' },
  setDetail: { fontSize: FontSizes.xs },
  setChevron: { fontSize: 22, fontWeight: '300' },

  // Trending
  setupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  trendingSection: { marginTop: Spacing.xl },
  trendingLoadingBox: { height: 160, justifyContent: 'center', alignItems: 'center' },
  trendingList: { gap: Spacing.md },
  trendCard: {
    width: 120,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  trendImage: { width: 90, height: 126, borderRadius: 4, marginBottom: Spacing.sm },
  trendName: { fontSize: FontSizes.xs, fontWeight: '600', textAlign: 'center' },
  trendPrice: { fontSize: FontSizes.sm, fontWeight: '800', marginTop: 4 },

  // Result rows
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    gap: Spacing.md,
  },
  cardImage: { width: 48, height: 67, borderRadius: 4 },
  cardImagePlaceholder: {
    width: 48, height: 67, borderRadius: 4,
    justifyContent: 'center', alignItems: 'center',
  },
  cardPlaceholderText: { fontSize: 20 },
  resultInfo: { flex: 1 },
  resultName: { fontSize: FontSizes.sm, fontWeight: '600' },
  resultMeta: { fontSize: FontSizes.xs, marginTop: 2 },
  resultRarity: { fontSize: FontSizes.xs, marginTop: 1 },
  resultRight: { alignItems: 'flex-end', gap: 6 },
  resultPrice: { fontSize: FontSizes.lg, fontWeight: '800' },
  priceLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  noPrice: { fontSize: FontSizes.md },

  // Save button (visible affordance — replaces long-press)
  saveBtn: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '400', lineHeight: 18 },

  // Loading & Empty
  loadingBox: { padding: Spacing.xxxl, alignItems: 'center', gap: Spacing.md },
  loadingText: { fontSize: FontSizes.sm },
  emptyBox: { padding: Spacing.xxxl * 2, alignItems: 'center', gap: Spacing.sm },
  emptyText: { fontSize: FontSizes.md, textAlign: 'center' },
  emptyHint: { fontSize: FontSizes.sm, textAlign: 'center' },

  // Toast
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 20, right: 20,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 8 },
      web: { boxShadow: '0 4px 16px rgba(0,0,0,0.4)' as any },
    }),
  },
  toastText: { fontSize: FontSizes.sm, fontWeight: '700', letterSpacing: 0.5 },
  
  // Comps
  clValueContainer: {
    marginTop: Spacing.xl,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  clValueLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  clValueAmount: { fontSize: 42, fontWeight: '900', letterSpacing: -1 },
  marginRow: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: '100%',
  },
  marginBox: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  marginLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  marginValue: { fontSize: FontSizes.md, fontWeight: '700' },
  alertBox: {
    marginTop: Spacing.lg,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    borderWidth: 1,
    width: '100%',
    alignItems: 'center',
  },
  alertText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  compRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    gap: Spacing.md,
    alignItems: 'center',
  },
  compImage: { width: 50, height: 50, borderRadius: 6 },
  compTitle: { fontSize: FontSizes.sm, fontWeight: '600' },
  compMeta: { fontSize: FontSizes.xs, marginTop: 4 },
  compPrice: { fontSize: FontSizes.md, fontWeight: '800' },

  // Hero Card Detail
  heroCardSection: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  heroCardImage: {
    width: 220,
    height: 310,
    borderRadius: 12,
    ...Platform.select({
      web: { boxShadow: '0 8px 32px rgba(0,0,0,0.6)' as any },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16 },
      android: { elevation: 16 },
    }),
  },
  heroCardPlaceholder: {
    width: 220,
    height: 310,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCardName: {
    fontSize: FontSizes.xl,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: Spacing.lg,
    letterSpacing: -0.5,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.sm,
  },
  heroMetaTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    textTransform: 'uppercase',
  },
  heroApiPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: Spacing.md,
  },
  heroApiPriceLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroApiPrice: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
  },
  marginPct: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // Methodology
  methodologyBox: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  methodologyTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  methodologySteps: {
    gap: 6,
  },
  methodStep: {
    fontSize: FontSizes.xs,
    lineHeight: 18,
  },

  // Save to Vault (card details)
  heroSaveBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  heroSaveBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '800',
    letterSpacing: 1,
  },
});

