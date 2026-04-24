import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Linking,
  ScrollView,
  Image,
  Platform,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/lib/ThemeContext';
import { ThemeName } from '@/constants/Themes';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';
import { BORDER_EFFECTS, BorderEffect } from '@/lib/wallpaper';
import ScreenTitle from '@/components/ScreenTitle';
import WallpaperBackground from '@/components/WallpaperBackground';

export default function SettingsScreen() {
  const { theme, themeName, setTheme, allThemes, wallpaper, setWallpaper, clearWallpaper } = useTheme();

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        // Use base64 data URI for cross-platform storage
        const uri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setWallpaper({ uri });
      }
    } catch (e) {
      console.warn('Image picker error:', e);
    }
  };

  const handleClearWallpaper = () => {
    if (Platform.OS === 'web') {
      if (confirm('Remove background wallpaper?')) clearWallpaper();
    } else {
      Alert.alert('Remove Wallpaper', 'Reset to default background?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: clearWallpaper },
      ]);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.statusBar} />
      <WallpaperBackground />
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle title="Settings" subtitle="System configuration" />

        {/* ── Theme Picker ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Theme</Text>
          <View style={styles.themeGrid}>
            {(Object.keys(allThemes) as ThemeName[]).map(name => {
              const meta = allThemes[name];
              const isActive = name === themeName;
              return (
                <TouchableOpacity
                  key={name}
                  style={[
                    styles.themeCard,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    isActive && { borderColor: theme.accent, backgroundColor: theme.accentDim },
                  ]}
                  onPress={() => setTheme(name)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.themeEmoji}>{meta.emoji}</Text>
                  <Text style={[
                    styles.themeLabel,
                    { color: isActive ? theme.accent : theme.textPrimary },
                  ]}>
                    {meta.label}
                  </Text>
                  <Text style={[styles.themeDesc, { color: theme.textMuted }]} numberOfLines={1}>
                    {meta.description}
                  </Text>
                  {isActive && (
                    <View style={[styles.activeDot, { backgroundColor: theme.accent }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Wallpaper ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Wallpaper</Text>
          <Text style={[styles.sectionHint, { color: theme.textDim }]}>
            Set any photo, NFT, or card as your background
          </Text>

          <View style={styles.wallpaperRow}>
            {/* Preview / Pick button */}
            <TouchableOpacity
              style={[styles.wallpaperPreview, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={pickImage}
              activeOpacity={0.7}
            >
              {wallpaper.uri ? (
                <Image source={{ uri: wallpaper.uri }} style={styles.wallpaperImage} resizeMode="cover" />
              ) : (
                <View style={styles.wallpaperEmpty}>
                  <Text style={[styles.wallpaperEmptyIcon, { color: theme.textDim }]}>＋</Text>
                  <Text style={[styles.wallpaperEmptyText, { color: theme.textMuted }]}>Choose Image</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Actions */}
            <View style={styles.wallpaperActions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme.accentMuted, borderColor: theme.borderGlow }]}
                onPress={pickImage}
              >
                <Text style={[styles.actionBtnText, { color: theme.accent }]}>
                  {wallpaper.uri ? 'CHANGE' : 'BROWSE'}
                </Text>
              </TouchableOpacity>
              {wallpaper.uri && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={handleClearWallpaper}
                >
                  <Text style={[styles.actionBtnText, { color: theme.textMuted }]}>REMOVE</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Border Effects */}
          <Text style={[styles.subsectionTitle, { color: theme.textMuted }]}>Border Effect</Text>
          <View style={styles.effectGrid}>
            {BORDER_EFFECTS.map(effect => {
              const isActive = wallpaper.borderEffect === effect.id;
              return (
                <TouchableOpacity
                  key={effect.id}
                  style={[
                    styles.effectCard,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    isActive && { borderColor: theme.accent, backgroundColor: theme.accentDim },
                  ]}
                  onPress={() => setWallpaper({ borderEffect: effect.id })}
                  activeOpacity={0.7}
                >
                  <Text style={styles.effectEmoji}>{effect.emoji}</Text>
                  <Text style={[
                    styles.effectLabel,
                    { color: isActive ? theme.accent : theme.textPrimary },
                  ]}>
                    {effect.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── About ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>About</Text>
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowText, { color: theme.textPrimary }]}>Version</Text>
            <Text style={[styles.rowValue, { color: theme.textSecondary }]}>1.0.0</Text>
          </View>
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowText, { color: theme.textPrimary }]}>Data Sources</Text>
            <Text style={[styles.rowValue, { color: theme.accent }]}>4 Free APIs</Text>
          </View>
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowText, { color: theme.textPrimary }]}>Games</Text>
            <Text style={[styles.rowValue, { color: theme.textSecondary }]}>Pokémon · Magic · Yu-Gi-Oh! · One Piece</Text>
          </View>
        </View>

        {/* ── Legal ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Legal</Text>
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: theme.border }]}
            onPress={() => Linking.openURL('https://the-undesirables.com/privacy')}
          >
            <Text style={[styles.rowText, { color: theme.textPrimary }]}>Privacy Policy</Text>
            <Text style={[styles.rowArrow, { color: theme.textMuted }]}>↗</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: theme.border }]}
            onPress={() => Linking.openURL('https://the-undesirables.com/terms')}
          >
            <Text style={[styles.rowText, { color: theme.textPrimary }]}>Terms of Service</Text>
            <Text style={[styles.rowArrow, { color: theme.textMuted }]}>↗</Text>
          </TouchableOpacity>
        </View>

        {/* ── Links ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Links</Text>
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: theme.border }]}
            onPress={() => Linking.openURL('https://the-undesirables.com')}
          >
            <Text style={[styles.rowText, { color: theme.textPrimary }]}>Website</Text>
            <Text style={[styles.rowArrow, { color: theme.textMuted }]}>↗</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: theme.border }]}
            onPress={() => Linking.openURL('https://x.com/undesirable_ai')}
          >
            <Text style={[styles.rowText, { color: theme.textPrimary }]}>Follow @undesirable_ai</Text>
            <Text style={[styles.rowArrow, { color: theme.textMuted }]}>↗</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Text style={[styles.footerText, { color: theme.textDim }]}>Built by The Undesirables</Text>
          <Text style={[styles.footerText, { color: theme.textDim }]}>TCG Oracle — AI Market Intelligence</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: 40,
  },

  // Sections
  section: {
    marginBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  sectionHint: {
    fontSize: FontSizes.xs,
    marginBottom: Spacing.md,
  },
  subsectionTitle: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // Theme grid
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  themeCard: {
    width: '31%',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    position: 'relative',
  },
  themeEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  themeLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  themeDesc: {
    fontSize: 8,
    marginTop: 2,
  },
  activeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Wallpaper
  wallpaperRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  wallpaperPreview: {
    width: 100,
    height: 140,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  wallpaperImage: {
    width: '100%',
    height: '100%',
  },
  wallpaperEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  wallpaperEmptyIcon: {
    fontSize: 28,
    fontWeight: '200',
  },
  wallpaperEmptyText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  wallpaperActions: {
    flex: 1,
    gap: Spacing.sm,
  },
  actionBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Border effects
  effectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  effectCard: {
    width: '18%',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 2,
  },
  effectEmoji: {
    fontSize: 18,
  },
  effectLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Rows
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
  },
  rowText: {
    fontSize: FontSizes.md,
  },
  rowValue: {
    fontSize: FontSizes.md,
  },
  rowArrow: {
    fontSize: FontSizes.md,
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xxxl,
    paddingTop: Spacing.xxl,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: FontSizes.xs,
  },
});
