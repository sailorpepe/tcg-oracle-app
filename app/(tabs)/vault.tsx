import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  Dimensions,
  Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';
import { Card, GAMES, getCardPurchaseUrl } from '@/lib/api';
import {
  getVault,
  removeFromVault,
  clearVault as clearVaultStorage,
  recordVaultSnapshot,
  getVaultHistory,
  VaultSnapshot,
} from '@/lib/vault';
import ScreenTitle from '@/components/ScreenTitle';
import WallpaperBackground from '@/components/WallpaperBackground';
import { useIsFocused } from '@react-navigation/native';
import SoulParticlesLite from '@/components/SoulParticlesLite';
import { SoulProfile, getSoul } from '@/lib/soul';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_HEIGHT = 120;
const CHART_PADDING = 16;

export default function VaultScreen() {
  const { theme } = useTheme();
  const [cards, setCards] = useState<Card[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [history, setHistory] = useState<VaultSnapshot[]>([]);
  const [sortBy, setSortBy] = useState<'added' | 'price' | 'name'>('added');

  // Soul — for ambient particles
  const [mountedSoul, setMountedSoul] = useState<SoulProfile | null>(null);
  useEffect(() => { getSoul().then(setMountedSoul); }, []);

  const loadVault = useCallback(async () => {
    const stored = await getVault();
    setCards(stored);
    const hist = await getVaultHistory();
    setHistory(hist);
  }, []);

  // Load on mount
  useEffect(() => {
    loadVault();
  }, [loadVault]);

  // Reload every time tab is focused (native)
  useFocusEffect(
    useCallback(() => {
      loadVault();
    }, [loadVault])
  );

  // Web: reload when tab becomes visible again
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadVault();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    // Also poll on an interval for web tab switches (cheap fallback)
    const interval = setInterval(loadVault, 2000);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [loadVault]);

  // Calculate total value and record daily snapshot
  useEffect(() => {
    const value = cards.reduce((sum, c) => sum + (c.price || 0), 0);
    setTotalValue(value);
    // Auto-record daily snapshot when vault loads with cards
    if (cards.length > 0) {
      recordVaultSnapshot(cards);
    }
  }, [cards]);

  // ─── Derived stats ───
  const stats = useMemo(() => {
    if (cards.length === 0) return null;
    const priced = cards.filter(c => c.price && c.price > 0);
    const avgPrice = priced.length > 0 ? priced.reduce((s, c) => s + (c.price || 0), 0) / priced.length : 0;
    const highest = priced.length > 0 ? priced.reduce((best, c) => (c.price || 0) > (best.price || 0) ? c : best, priced[0]) : null;
    
    // Game breakdown
    const gameMap: Record<string, { count: number; value: number }> = {};
    cards.forEach(c => {
      const g = c.game || 'Unknown';
      if (!gameMap[g]) gameMap[g] = { count: 0, value: 0 };
      gameMap[g].count++;
      gameMap[g].value += c.price || 0;
    });
    const gameBreakdown = Object.entries(gameMap)
      .sort((a, b) => b[1].value - a[1].value)
      .map(([game, data]) => ({
        game,
        ...data,
        emoji: GAMES.find(g => g.id === game)?.emoji || '🃏',
      }));

    // Portfolio change (if we have history)
    let change24h = 0;
    let changePct = 0;
    if (history.length >= 2) {
      const prev = history[history.length - 2].totalValue;
      const curr = totalValue;
      change24h = curr - prev;
      changePct = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    }

    return { avgPrice, highest, gameBreakdown, change24h, changePct };
  }, [cards, history, totalValue]);

  // ─── Sorted cards ───
  const sortedCards = useMemo(() => {
    const sorted = [...cards];
    if (sortBy === 'price') sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    // 'added' = original order
    return sorted;
  }, [cards, sortBy]);

  const handleRemove = async (cardId: string) => {
    const updated = await removeFromVault(cardId);
    setCards(updated);
  };

  const handleClear = () => {
    if (Platform.OS === 'web') {
      if (confirm('Clear your entire Vault? This cannot be undone.')) {
        clearVaultStorage();
        setCards([]);
      }
    } else {
      Alert.alert('Clear Vault', 'Remove all cards from your Vault?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive', onPress: async () => {
            await clearVaultStorage();
            setCards([]);
          }
        },
      ]);
    }
  };

  const openCardUrl = (card: Card) => {
    const { url } = getCardPurchaseUrl(card);
    if (url) Linking.openURL(url);
  };

  // ─── Mini Sparkline Chart (SVG-free, pure RN) ───
  const renderChart = () => {
    if (history.length < 2) return null;
    
    const values = history.map(s => s.totalValue);
    const maxVal = Math.max(...values, 1);
    const minVal = Math.min(...values, 0);
    const range = maxVal - minVal || 1;
    const chartWidth = SCREEN_WIDTH - (Spacing.xl * 2) - (CHART_PADDING * 2);
    const stepX = chartWidth / (values.length - 1);
    
    const isPositive = values[values.length - 1] >= values[0];
    const lineColor = isPositive ? '#39FF14' : '#ff6b6b';

    return (
      <View style={[styles.chartContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.chartHeader}>
          <Text style={[styles.chartTitle, { color: theme.textPrimary }]}>◈ PORTFOLIO VALUE</Text>
          <Text style={[styles.chartRange, { color: theme.textMuted }]}>{history.length} days tracked</Text>
        </View>
        
        {/* Chart area */}
        <View style={[styles.chartArea, { height: CHART_HEIGHT }]}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
            <View
              key={i}
              style={[styles.gridLine, {
                bottom: pct * CHART_HEIGHT,
                backgroundColor: theme.border,
              }]}
            />
          ))}
          
          {/* Y-axis labels */}
          <Text style={[styles.yLabel, styles.yLabelTop, { color: theme.textDim }]}>
            ${maxVal.toFixed(0)}
          </Text>
          <Text style={[styles.yLabel, styles.yLabelBot, { color: theme.textDim }]}>
            ${minVal.toFixed(0)}
          </Text>
          
          {/* Data points + connecting bars */}
          {values.map((val, i) => {
            const barHeight = ((val - minVal) / range) * CHART_HEIGHT;
            const x = i * stepX;
            return (
              <View
                key={i}
                style={[styles.chartBar, {
                  left: x + CHART_PADDING,
                  height: Math.max(barHeight, 2),
                  bottom: 0,
                  width: Math.max(stepX - 1, 2),
                  backgroundColor: lineColor,
                  opacity: 0.15 + (i / values.length) * 0.85,
                }]}
              />
            );
          })}
          
          {/* Dot markers */}
          {values.map((val, i) => {
            const y = ((val - minVal) / range) * CHART_HEIGHT;
            const x = i * stepX;
            return (
              <View
                key={`dot-${i}`}
                style={[styles.chartDot, {
                  left: x + CHART_PADDING - 3,
                  bottom: y - 3,
                  backgroundColor: lineColor,
                  borderColor: theme.surface,
                }]}
              />
            );
          })}
        </View>
        
        {/* X-axis dates */}
        <View style={styles.xAxis}>
          <Text style={[styles.xLabel, { color: theme.textDim }]}>
            {history[0]?.date?.split('-').slice(1).join('/')}
          </Text>
          <Text style={[styles.xLabel, { color: theme.textDim }]}>
            {history[history.length - 1]?.date?.split('-').slice(1).join('/')}
          </Text>
        </View>
      </View>
    );
  };

  const renderCard = ({ item, index }: { item: Card; index: number }) => {
    const gameInfo = GAMES.find(g => g.id === item.game);
    return (
      <TouchableOpacity
        style={[styles.cardRow, { borderBottomColor: theme.border }]}
        onPress={() => openCardUrl(item)}
        activeOpacity={0.7}
      >
        <Text style={[styles.cardIndex, { color: theme.textDim }]}>{index + 1}</Text>
        {item.imageUrlSmall ? (
          <Image source={{ uri: item.imageUrlSmall }} style={styles.cardImage} resizeMode="contain" />
        ) : (
          <View style={[styles.cardImagePlaceholder, { backgroundColor: theme.surfaceElevated }]}>
            <Text style={styles.cardPlaceholderEmoji}>{gameInfo?.emoji || '🃏'}</Text>
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, { color: theme.textPrimary }]} numberOfLines={2}>{item.name}</Text>
          <Text style={[styles.cardMeta, { color: theme.textMuted }]}>
            {gameInfo?.emoji} {item.set}
          </Text>
          {item.rarity ? (
            <Text style={[styles.cardRarity, { color: theme.textSecondary }]}>{item.rarity}</Text>
          ) : null}
          {item.notarizedTx && (
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#39FF1420', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#39FF1440' }}
              onPress={(e) => { e.stopPropagation(); if (Platform.OS === 'web') window.open(`https://liteforge.explorer.caldera.xyz/tx/${item.notarizedTx}`, '_blank'); else Linking.openURL(`https://liteforge.explorer.caldera.xyz/tx/${item.notarizedTx}`); }}
            >
              <Text style={{ fontSize: 10, color: '#39FF14', fontWeight: 'bold' }}>✅ ON-CHAIN</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.cardPriceBox}>
          {item.price != null ? (
            <Text style={[styles.cardPrice, { color: theme.accent }]}>${item.price.toFixed(2)}</Text>
          ) : (
            <Text style={[styles.noPrice, { color: theme.textDim }]}>—</Text>
          )}
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation?.(); handleRemove(item.id); }}
            style={[styles.removeBtn, { borderColor: theme.border }]}
          >
            <Text style={[styles.removeBtnText, { color: theme.textMuted }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Tab visibility guard (Tauri WebKit doesn't hide inactive tabs) ───
  const isFocused = useIsFocused();
  if (Platform.OS === 'web' && !isFocused) {
    return <View style={{ width: 0, height: 0, overflow: 'hidden', position: 'absolute' }} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <WallpaperBackground />
      <SoulParticlesLite soul={mountedSoul} intensity="subtle" />
      <StatusBar barStyle={theme.statusBar} />
      <FlatList
        data={sortedCards}
        renderItem={renderCard}
        keyExtractor={(item, i) => `${item.game}-${item.id}-${i}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenTitle title="Vault" subtitle="Encrypted local asset storage" showGear />

            {/* Stats row */}
            {cards.length > 0 && (
              <>
                <View style={styles.statsRow}>
                  <View style={[styles.statBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.statValue, { color: theme.accent }]}>{cards.length}</Text>
                    <Text style={[styles.statLabel, { color: theme.textMuted }]}>ASSETS</Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.statValue, { color: theme.accent }]}>${totalValue.toFixed(2)}</Text>
                    <Text style={[styles.statLabel, { color: theme.textMuted }]}>PORTFOLIO</Text>
                  </View>
                  {stats && stats.change24h !== 0 && (
                    <View style={[styles.statBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <Text style={[styles.statValue, {
                        color: stats.change24h >= 0 ? '#39FF14' : '#ff6b6b',
                      }]}>
                        {stats.change24h >= 0 ? '▲' : '▼'} {stats.changePct.toFixed(1)}%
                      </Text>
                      <Text style={[styles.statLabel, { color: theme.textMuted }]}>DAILY Δ</Text>
                    </View>
                  )}
                </View>

                {/* Portfolio Value Chart */}
                {renderChart()}

                {/* Game Breakdown */}
                {stats && stats.gameBreakdown.length > 1 && (
                  <View style={[styles.breakdownContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.breakdownTitle, { color: theme.textPrimary }]}>◈ ALLOCATION</Text>
                    {stats.gameBreakdown.map((g, i) => {
                      const pct = totalValue > 0 ? (g.value / totalValue) * 100 : 0;
                      return (
                        <View key={g.game} style={styles.breakdownRow}>
                          <Text style={[styles.breakdownGame, { color: theme.textSecondary }]}>
                            {g.emoji} {g.game}
                          </Text>
                          <View style={styles.breakdownBarWrap}>
                            <View style={[styles.breakdownBar, {
                              width: `${Math.max(pct, 2)}%`,
                              backgroundColor: theme.accent,
                              opacity: 0.7 - (i * 0.1),
                            }]} />
                          </View>
                          <Text style={[styles.breakdownValue, { color: theme.textMuted }]}>
                            {g.count}× · ${g.value.toFixed(0)} ({pct.toFixed(0)}%)
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Sort controls + action buttons */}
                <View style={styles.controlsRow}>
                  <View style={styles.sortPills}>
                    {([['added', '⏱ Recent'], ['price', '💰 Value'], ['name', 'A→Z']] as const).map(([key, label]) => (
                      <TouchableOpacity
                        key={key}
                        style={[styles.sortPill, sortBy === key && { backgroundColor: theme.accent + '20', borderColor: theme.accent }]}
                        onPress={() => setSortBy(key as any)}
                      >
                        <Text style={[styles.sortPillText, { color: sortBy === key ? theme.accent : theme.textMuted }]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    onPress={handleClear}
                    style={[styles.clearBtn, { borderColor: '#ff6b6b44' }]}
                  >
                    <Text style={[styles.clearBtnText, { color: '#ff6b6b' }]}>Clear All</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyGlyph, { color: theme.textDim }]}>⬡</Text>
            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>VAULT UNINITIALIZED</Text>
            <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
              No assets secured. Query the index to establish baseline portfolio.
            </Text>

            {/* Feature callouts */}
            <View style={styles.featuresRow}>
              {[
                { glyph: '⬡', label: 'Local Only', desc: 'On-device encrypted storage' },
                { glyph: '◈', label: 'Portfolio', desc: 'Track value over time' },
                { glyph: '▷', label: 'Tap to Buy', desc: 'Direct marketplace links' },
              ].map((f, i) => (
                <View key={i} style={[styles.featureCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.featureGlyph, { color: theme.accent }]}>{f.glyph}</Text>
                  <Text style={[styles.featureLabel, { color: theme.textPrimary }]}>{f.label}</Text>
                  <Text style={[styles.featureDesc, { color: theme.textMuted }]}>{f.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingBottom: 40 },
  header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },

  // Stats
  statsRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg, alignItems: 'center' },
  statBox: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  statValue: { fontSize: FontSizes.xl, fontWeight: '900' },
  statLabel: { fontSize: FontSizes.xs, marginTop: 2, letterSpacing: 1 },

  // Chart
  chartContainer: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: CHART_PADDING,
    overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  chartTitle: { fontSize: FontSizes.sm, fontWeight: '800', letterSpacing: 1 },
  chartRange: { fontSize: FontSizes.xs },
  chartArea: { position: 'relative', overflow: 'hidden' },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    opacity: 0.3,
  },
  yLabel: { position: 'absolute', right: 0, fontSize: 9, fontWeight: '600' },
  yLabelTop: { top: 0 },
  yLabelBot: { bottom: 0 },
  chartBar: {
    position: 'absolute',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  chartDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: CHART_PADDING,
  },
  xLabel: { fontSize: 9 },

  // Game breakdown
  breakdownContainer: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  breakdownTitle: { fontSize: FontSizes.xs, fontWeight: '800', letterSpacing: 1, marginBottom: Spacing.sm },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: Spacing.sm,
  },
  breakdownGame: { fontSize: FontSizes.xs, width: 90, fontWeight: '600' },
  breakdownBarWrap: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  breakdownBar: { height: '100%', borderRadius: 4 },
  breakdownValue: { fontSize: 10, width: 110, textAlign: 'right' },

  // Sort + controls
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sortPills: { flexDirection: 'row', gap: Spacing.xs },
  sortPill: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sortPillText: { fontSize: FontSizes.xs, fontWeight: '600' },
  clearBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  clearBtnText: { fontSize: FontSizes.xs, fontWeight: '600' },

  // Card rows
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    gap: Spacing.md,
  },
  cardIndex: { fontSize: FontSizes.xs, width: 20, textAlign: 'center', fontWeight: '700' },
  cardImage: { width: 48, height: 67, borderRadius: 4 },
  cardImagePlaceholder: {
    width: 48, height: 67, borderRadius: 4,
    justifyContent: 'center', alignItems: 'center',
  },
  cardPlaceholderEmoji: { fontSize: 20 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: FontSizes.sm, fontWeight: '600' },
  cardMeta: { fontSize: FontSizes.xs, marginTop: 2 },
  cardRarity: { fontSize: FontSizes.xs, marginTop: 1 },
  cardPriceBox: { alignItems: 'flex-end', gap: Spacing.sm },
  cardPrice: { fontSize: FontSizes.lg, fontWeight: '800' },
  noPrice: { fontSize: FontSizes.md },
  removeBtn: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  removeBtnText: { fontSize: 11, fontWeight: '700' },

  // Empty state
  emptyBox: { padding: Spacing.xxxl, alignItems: 'center', gap: Spacing.md },
  emptyGlyph: { fontSize: 64, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: FontSizes.xl, fontWeight: '900', letterSpacing: 2 },
  emptyDesc: { fontSize: FontSizes.sm, textAlign: 'center', lineHeight: 20 },

  // Features
  featuresRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xxl },
  featureCard: {
    flex: 1, padding: Spacing.md, borderRadius: BorderRadius.lg,
    borderWidth: 1, alignItems: 'center', gap: 4,
  },
  featureGlyph: { fontSize: 22 },
  featureLabel: { fontSize: FontSizes.xs, fontWeight: '700', letterSpacing: 0.5 },
  featureDesc: { fontSize: 9, textAlign: 'center' },
});
