import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Linking,
  ScrollView,
} from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { ThemeName } from '@/constants/Themes';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';
import ScreenTitle from '@/components/ScreenTitle';

export default function SettingsScreen() {
  const { theme, themeName, setTheme, allThemes } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.statusBar} />
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

        {/* ── AI Model ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>AI Model</Text>
          <TouchableOpacity style={[styles.row, { borderBottomColor: theme.border }]}>
            <View>
              <Text style={[styles.rowText, { color: theme.textPrimary }]}>Local AI Model</Text>
              <Text style={[styles.rowHint, { color: theme.textMuted }]}>
                Offline grading — runs on your device
              </Text>
            </View>
            <View style={[styles.proBadge, { backgroundColor: theme.accentMuted }]}>
              <Text style={[styles.proBadgeText, { color: theme.accent }]}>PRO</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Subscription ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Subscription</Text>
          <TouchableOpacity style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowText, { color: theme.textPrimary }]}>Restore Purchases</Text>
            <Text style={[styles.rowArrow, { color: theme.textMuted }]}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowText, { color: theme.textPrimary }]}>Manage Subscription</Text>
            <Text style={[styles.rowArrow, { color: theme.textMuted }]}>→</Text>
          </TouchableOpacity>
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
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: '900',
    marginBottom: Spacing.xxl,
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
  rowHint: {
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  rowValue: {
    fontSize: FontSizes.md,
  },
  rowArrow: {
    fontSize: FontSizes.md,
  },

  // Pro badge
  proBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
  },
  proBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: '800',
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
