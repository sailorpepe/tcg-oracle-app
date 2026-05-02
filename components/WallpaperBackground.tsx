/**
 * WallpaperBackground — renders the user's custom wallpaper + border effect
 * behind screen content. Designed to be the first child inside SafeAreaView.
 */

import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Dimensions, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import { BORDER_EFFECTS } from '@/lib/wallpaper';

const { width, height } = Dimensions.get('window');

export default function WallpaperBackground() {
  const { wallpaper, theme } = useTheme();

  const effectMeta = BORDER_EFFECTS.find(e => e.id === wallpaper.borderEffect);
  const hasEffect = effectMeta && effectMeta.colors.length > 0;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (wallpaper.uri && hasEffect && wallpaper.effectsEnabled !== false) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [wallpaper.uri, hasEffect, wallpaper.effectsEnabled]);

  if (!wallpaper.uri) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Wallpaper image */}
      <Image
        source={{ uri: wallpaper.uri }}
        style={[styles.image, { opacity: wallpaper.opacity }]}
        resizeMode="cover"
      />

      {/* Dark overlay for readability */}
      <View style={[styles.overlay, { backgroundColor: theme.background, opacity: 0.2 }]} />

      {/* Border effect — gradient frame */}
      {hasEffect && (
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: pulseAnim }]}>
          {/* Top edge */}
          <LinearGradient
            colors={effectMeta.colors as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[styles.borderEdge, styles.borderTop]}
          />
          {/* Bottom edge */}
          <LinearGradient
            colors={effectMeta.colors as [string, string, ...string[]]}
            start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }}
            style={[styles.borderEdge, styles.borderBottom]}
          />
          {/* Left edge */}
          <LinearGradient
            colors={effectMeta.colors as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={[styles.borderEdge, styles.borderLeft]}
          />
          {/* Right edge */}
          <LinearGradient
            colors={effectMeta.colors as [string, string, ...string[]]}
            start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }}
            style={[styles.borderEdge, styles.borderRight]}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  borderEdge: {
    position: 'absolute',
  },
  borderTop: {
    top: 0, left: 0, right: 0,
    height: 3,
  },
  borderBottom: {
    bottom: 0, left: 0, right: 0,
    height: 3,
  },
  borderLeft: {
    top: 0, bottom: 0, left: 0,
    width: 3,
  },
  borderRight: {
    top: 0, bottom: 0, right: 0,
    width: 3,
  },
});
