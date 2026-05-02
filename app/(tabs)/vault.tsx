import React, { useState, useEffect, useCallback } from 'react';
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
  AppState,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';
import { Card, GAMES } from '@/lib/api';
import { getVault, removeFromVault, clearVault as clearVaultStorage } from '@/lib/vault';
import ScreenTitle from '@/components/ScreenTitle';
import WallpaperBackground from '@/components/WallpaperBackground';
import { useIsFocused } from '@react-navigation/native';

export default function VaultScreen() {
  const { theme } = useTheme();
  const [cards, setCards] = useState<Card[]>([]);
  const [totalValue, setTotalValue] = useState(0);

  const loadVault = useCallback(async () => {
    const stored = await getVault();
    setCards(stored);
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

  useEffect(() => {
    const value = cards.reduce((sum, c) => sum + (c.price || 0), 0);
    setTotalValue(value);
  }, [cards]);

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

  const renderCard = ({ item }: { item: Card }) => {
    const gameInfo = GAMES.find(g => g.id === item.game);
    return (
      <View style={[styles.cardRow, { borderBottomColor: theme.border }]}>
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
        </View>
        <View style={styles.cardPriceBox}>
          {item.price != null ? (
            <Text style={[styles.cardPrice, { color: theme.accent }]}>${item.price.toFixed(2)}</Text>
          ) : (
            <Text style={[styles.noPrice, { color: theme.textDim }]}>—</Text>
          )}
          <TouchableOpacity
            onPress={() => handleRemove(item.id)}
            style={[styles.removeBtn, { borderColor: theme.border }]}
          >
            <Text style={[styles.removeBtnText, { color: theme.textMuted }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
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
      <StatusBar barStyle={theme.statusBar} />
      <FlatList
        data={cards}
        renderItem={renderCard}
        keyExtractor={(item, i) => `${item.game}-${item.id}-${i}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenTitle title="Vault" subtitle="Encrypted local asset storage" showGear />

            {/* Stats row — no Clear All */}
            {cards.length > 0 && (
              <View style={styles.statsRow}>
                <View style={[styles.statBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.statValue, { color: theme.accent }]}>{cards.length}</Text>
                  <Text style={[styles.statLabel, { color: theme.textMuted }]}>ASSETS</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.statValue, { color: theme.accent }]}>${totalValue.toFixed(2)}</Text>
                  <Text style={[styles.statLabel, { color: theme.textMuted }]}>PORTFOLIO</Text>
                </View>
              </View>
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
                { glyph: '◈', label: 'Portfolio', desc: 'Aggregate market valuation' },
                { glyph: '▷', label: 'Alerts', desc: 'Price movement notifications' },
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
  statLabel: { fontSize: FontSizes.xs, marginTop: 2 },
  clearBtn: {
    paddingVertical: Spacing.sm,
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
