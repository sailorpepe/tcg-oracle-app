import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Animated,
  Platform,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';
import { searchCards, GAMES, Card, GameId } from '@/lib/api';
import { addToVault } from '@/lib/vault';
import ScreenTitle from '@/components/ScreenTitle';

export default function MarketScreen() {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeFilter, setActiveFilter] = useState<GameId | 'all'>('all');
  const [totalResults, setTotalResults] = useState(0);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ message, type });
    Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    toastTimeout.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setToast(null);
      });
    }, 2000);
  };

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const game = activeFilter === 'all' ? undefined : activeFilter;
      const data = await searchCards(query.trim(), game);
      setResults(data.cards);
      setTotalResults(data.total);
    } catch (e) {
      console.warn('Search failed:', e);
      setResults([]);
      setTotalResults(0);
    } finally {
      setLoading(false);
    }
  }, [query, activeFilter]);

  const handleLongPress = async (card: Card) => {
    const { added, alreadyExists } = await addToVault(card);
    if (added) {
      showToast(`🔒 ${card.name} saved to Vault`, 'success');
    } else if (alreadyExists) {
      showToast(`Already in your Vault`, 'info');
    }
  };

  const renderCard = ({ item }: { item: Card }) => {
    const gameInfo = GAMES.find(g => g.id === item.game);
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
        style={[styles.resultRow, { borderBottomColor: theme.border }]}
      >
        {item.imageUrlSmall ? (
          <Image source={{ uri: item.imageUrlSmall }} style={styles.cardImage} resizeMode="contain" />
        ) : (
          <View style={[styles.cardImagePlaceholder, { backgroundColor: theme.surfaceElevated }]}>
            <Text style={styles.cardImagePlaceholderText}>{gameInfo?.emoji || '🃏'}</Text>
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
        <View style={styles.resultPriceBox}>
          {item.price != null ? (
            <>
              <Text style={[styles.resultPrice, { color: theme.accent }]}>
                ${item.price.toFixed(2)}
              </Text>
              {item.priceSource && (
                <Text style={[styles.priceSource, { color: theme.textDim }]}>{item.priceSource}</Text>
              )}
            </>
          ) : (
            <Text style={[styles.noPrice, { color: theme.textDim }]}>—</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const filters = [
    { id: 'all' as const, label: 'All', emoji: '🌐' },
    ...GAMES.map(g => ({ id: g.id, label: g.name, emoji: g.emoji })),
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.statusBar} />
      <View style={styles.header}>
        <ScreenTitle
          emoji="💰"
          title="Market"
          subtitle="Search across Pokémon, Magic, Yu-Gi-Oh! & One Piece"
        />

        <View style={styles.searchRow}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
            placeholder="Search cards..."
            placeholderTextColor={theme.textMuted}
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
            <Text style={styles.searchBtnText}>🔍</Text>
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
              onPress={() => setActiveFilter(f.id)}
            >
              <Text style={styles.filterEmoji}>{f.emoji}</Text>
              <Text style={[
                styles.filterPillText,
                { color: theme.textMuted },
                activeFilter === f.id && { color: theme.accent },
              ]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {searched && !loading && (
          <View style={styles.resultCountRow}>
            <Text style={[styles.resultCount, { color: theme.textMuted }]}>
              {totalResults} results found
            </Text>
            <Text style={[styles.longPressHint, { color: theme.textDim }]}>
              Long-press to save to Vault
            </Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>
            Searching {activeFilter === 'all' ? 'all games' : GAMES.find(g => g.id === activeFilter)?.name}...
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          renderItem={renderCard}
          keyExtractor={(item, i) => `${item.game}-${item.id}-${i}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            searched ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No results found</Text>
                <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
                  Try a different search term or game filter
                </Text>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🃏</Text>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Search any card by name</Text>
                <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
                  Try "Charizard", "Black Lotus", "Dark Magician", or "Luffy"
                </Text>
                <Text style={[styles.emptyHint, { color: theme.textDim, marginTop: Spacing.sm }]}>
                  💡 Long-press any card to save it to your Vault
                </Text>
                <View style={[styles.legalBadge, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                  <Text style={[styles.legalText, { color: theme.textDim }]}>
                    ✅ Data from free, open APIs — Pokémon TCG API, Scryfall, YGOProDeck, OPTCG
                  </Text>
                </View>
              </View>
            )
          }
        />
      )}

      {/* Toast overlay */}
      {toast && (
        <Animated.View
          style={[
            styles.toast,
            {
              backgroundColor: toast.type === 'success' ? theme.accentMuted : theme.surfaceElevated,
              borderColor: toast.type === 'success' ? theme.borderGlow : theme.border,
              opacity: toastOpacity,
            },
          ]}
        >
          <Text style={[styles.toastText, { color: toast.type === 'success' ? theme.accent : theme.textSecondary }]}>
            {toast.message}
          </Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingBottom: 20 },
  header: { padding: Spacing.xl },

  // Search
  searchRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  searchInput: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.md,
  },
  searchBtn: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
  },
  searchBtnText: { fontSize: 18 },

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
  filterEmoji: { fontSize: 14 },
  filterPillText: { fontSize: FontSizes.xs, fontWeight: '600' },

  // Result count
  resultCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  resultCount: { fontSize: FontSizes.xs },
  longPressHint: { fontSize: 9, fontStyle: 'italic' },

  // Results with card images
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    gap: Spacing.md,
  },
  cardImage: {
    width: 48,
    height: 67,
    borderRadius: 4,
  },
  cardImagePlaceholder: {
    width: 48,
    height: 67,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardImagePlaceholderText: { fontSize: 20 },
  resultInfo: { flex: 1 },
  resultName: { fontSize: FontSizes.sm, fontWeight: '600' },
  resultMeta: { fontSize: FontSizes.xs, marginTop: 2 },
  resultRarity: { fontSize: FontSizes.xs, marginTop: 1 },
  resultPriceBox: { alignItems: 'flex-end' },
  resultPrice: { fontSize: FontSizes.lg, fontWeight: '800' },
  priceSource: { fontSize: 9, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
  noPrice: { fontSize: FontSizes.md },

  // Loading & empty
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md },
  loadingText: { fontSize: FontSizes.sm },
  emptyBox: { padding: Spacing.xxxl * 2, alignItems: 'center', gap: Spacing.sm },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSizes.md, textAlign: 'center' },
  emptyHint: { fontSize: FontSizes.sm, textAlign: 'center' },

  // Legal badge
  legalBadge: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  legalText: { fontSize: 10, textAlign: 'center' },

  // Toast
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
      web: { boxShadow: '0 4px 16px rgba(0,0,0,0.4)' as any },
    }),
  },
  toastText: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
});
