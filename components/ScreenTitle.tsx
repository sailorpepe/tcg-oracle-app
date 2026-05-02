import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import { useRouter } from 'expo-router';

interface Props {
  emoji?: string;
  title: string;
  subtitle?: string;
  showGear?: boolean;
}

/**
 * Premium centered screen title with gradient glow and accent underline.
 * Uses system font with heavy weight + wide letter spacing for a sci-fi feel.
 * Optional gear icon in the top-right for settings access.
 */
export default function ScreenTitle({ emoji, title, subtitle, showGear = false }: Props) {
  const { theme, wallpaper } = useTheme();
  const router = useRouter();

  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showGear && wallpaper.effectsEnabled !== false) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 1500,
            useNativeDriver: true, // Note: opacity and transform are supported
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(0);
    }
  }, [showGear, wallpaper.effectsEnabled]);

  return (
    <View style={styles.container}>
      {/* Glow background */}
      <LinearGradient
        colors={[theme.accentDim, 'transparent']}
        style={styles.glow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Gear icon — top right */}
      {showGear && (
        <TouchableOpacity
          style={styles.gearButton}
          onPress={() => router.navigate('/settings')}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Animated.View style={[
            styles.gearGlow,
            { opacity: pulseAnim }
          ]} />
          <Text style={[styles.gearIcon, { color: theme.textPrimary }]}>⚙</Text>
          <Text style={[styles.gearLabel, { color: theme.textMuted }]}>Settings</Text>
        </TouchableOpacity>
      )}

      {/* Title row — centered */}
      <View style={styles.titleRow}>
        {emoji && <Text style={styles.emoji}>{emoji}</Text>}
        <Text style={[styles.title, { color: theme.accent }]}>{title}</Text>
      </View>

      {/* Centered accent underline */}
      <View style={styles.accentLineWrapper}>
        <LinearGradient
          colors={['transparent', theme.accent, 'transparent']}
          style={styles.accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      </View>

      {subtitle && (
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    opacity: 0.25,
  },
  gearButton: {
    position: 'absolute',
    top: 14,
    right: 20,
    zIndex: 10,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gearGlow: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 5,
  },
  gearIcon: {
    fontSize: 22,
    zIndex: 2,
    textShadowColor: '#fff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  gearLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
    zIndex: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 1,
  },
  emoji: {
    fontSize: 28,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
    textTransform: 'uppercase',
    ...Platform.select({
      ios: { fontFamily: 'System' },
      android: { fontFamily: 'sans-serif-black' },
      web: { fontFamily: '"SF Pro Display", "Inter", "Segoe UI", system-ui, sans-serif' },
    }),
  },
  accentLineWrapper: {
    marginTop: 8,
    height: 2,
    width: 120,
    borderRadius: 1,
    overflow: 'hidden',
  },
  accentGradient: {
    flex: 1,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 10,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
    zIndex: 1,
  },
});
