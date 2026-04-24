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

type ViewMode = 'home' | 'sets' | 'cards' | 'results';

export default function IndexScreen() {
  const { theme } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [selectedGame, setSelectedGame] = useState<GameInfo | null>(null);
  const [sets, setSets] = useState<CardSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<CardSet | null>(null);
  const [setCards, setSetCards] = useState<Card[]>([]);
  const [trendingCards, setTrendingCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);

  // Search state (merged from Market)
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeFilter, setActiveFilter] = useState<GameId | 'all'>('all');
  const [totalResults, setTotalResults] = useState(0);
  const [trendingLoading, setTrendingLoading] = useState(false);

  // Signature queries — each game gets its most iconic card for trending
  const SIGNATURE_QUERIES: Record<GameId | 'all', { term: string; game?: GameId }> = {
    all: { term: 'Charizard', game: 'pokemon' },
    pokemon: { term: 'Charizard', game: 'pokemon' },
    magic: { term: 'Lotus', game: 'magic' },
    yugioh: { term: 'Dark Magician', game: 'yugioh' },
    onepiece: { term: 'Luffy', game: 'onepiece' },
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

  const loadTrending = async (filter: GameId | 'all') => {
    setTrendingLoading(true);
    try {
      const sig = SIGNATURE_QUERIES[filter];
      const result = await searchCards(sig.term, sig.game);
      setTrendingCards(result.cards.slice(0, 8));
    } catch { setTrendingCards([]); }
    setTrendingLoading(false);
  };

  // When a filter pill is tapped, reload trending AND set the search filter
  const handleFilterChange = (filter: GameId | 'all') => {
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
      const game = activeFilter === 'all' ? undefined : activeFilter;
      const data = await searchCards(query.trim(), game);
      setResults(data.cards);
      setTotalResults(data.total);
    } catch {
      setResults([]);
      setTotalResults(0);
    }
    setSearchLoading(false);
  }, [query, activeFilter]);

  const handleSaveToVault = async (card: Card) => {
    const { added, alreadyExists } = await addToVault(card);
    if (added) showToast(`SYS: ${card.name.substring(0, 24)} secured to Vault`);
    else if (alreadyExists) showToast('SYS: Asset already in Vault');
  };

  const goBack = () => {
    if (viewMode === 'cards') { setViewMode('sets'); setSelectedSet(null); setSetCards([]); }
    else if (viewMode === 'sets') { setViewMode('home'); setSelectedGame(null); }
    else if (viewMode === 'results') { setViewMode('home'); setSearched(false); setResults([]); }
  };

  // ─── Filters ────────────────────────────────
  const filters = [
    { id: 'all' as const, label: 'All', code: '◉' },
    ...GAMES.map(g => ({ id: g.id, label: g.name, code: g.emoji })),
  ];

  // ─── Card Result Row (shared) ───────────────
  const renderResultRow = ({ item }: { item: Card }) => {
    const gameInfo = GAMES.find(g => g.id === item.game);
    return (
      <View style={[styles.resultRow, { borderBottomColor: theme.border }]}>
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
            {gameInfo?.emoji} {item.set}
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
      </View>
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
      onPress={() => handleSaveToVault(item)}
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
          placeholder="Query the index..."
          placeholderTextColor={theme.textDim}
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

    return (
      <View style={styles.header}>
        <ScreenTitle title="Index" subtitle="Cross-system market telemetry" showGear />

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
});
