/**
 * UNDSRSlab — Premium Grading Slab Component
 *
 * Renders a photorealistic grading slab (like PSA/Beckett) with:
 * - Metallic gradient label header
 * - Holographic shimmer animation for high grades
 * - Card thumbnail centered in a transparent "case" area
 * - Sub-grade breakdown in a stamped-metal footer
 * - Tier-specific color palettes (Pristine/Gem Mint/Mint/Near Mint/Standard)
 *
 * Pure React Native — no SVG, no Canvas, no external deps.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';

// ─── Types ────────────────────────────────────────────────

interface SlabTier {
  name: string;
  colors: [string, string, string]; // gradient stops (metallic)
  accent: string;
  textColor: string;
  borderColor: string;
  glowColor: string;
  shimmer: boolean;
}

interface SubGrade {
  label: string;
  abbr: string;
  score: number;
}

interface UNDSRSlabProps {
  grade: number;          // 1.0 - 10.0
  cardName?: string;      // "Charizard Base Set #4"
  cardImageUri?: string;  // URI to the captured card photo
  subGrades: SubGrade[];  // [{ label: 'Centering', abbr: 'C', score: 9.0 }, ...]
  theme: any;             // App theme for contrast
}

// ─── Tier Configuration ───────────────────────────────────

function getTier(grade: number): SlabTier {
  if (grade >= 9.5) return {
    name: 'PRISTINE',
    colors: ['#c7d2fe', '#818cf8', '#4f46e5'],
    accent: '#6366f1',
    textColor: '#312e81',
    borderColor: '#4f46e5',
    glowColor: 'rgba(99,102,241,0.35)',
    shimmer: true,
  };
  if (grade >= 9.0) return {
    name: 'GEM MINT',
    colors: ['#fef3c7', '#f59e0b', '#d97706'],
    accent: '#d97706',
    textColor: '#78350f',
    borderColor: '#b45309',
    glowColor: 'rgba(245,158,11,0.30)',
    shimmer: true,
  };
  if (grade >= 8.0) return {
    name: 'MINT',
    colors: ['#d1fae5', '#10b981', '#059669'],
    accent: '#059669',
    textColor: '#064e3b',
    borderColor: '#047857',
    glowColor: 'rgba(16,185,129,0.25)',
    shimmer: false,
  };
  if (grade >= 6.0) return {
    name: 'NEAR MINT',
    colors: ['#e5e7eb', '#9ca3af', '#6b7280'],
    accent: '#6b7280',
    textColor: '#1f2937',
    borderColor: '#4b5563',
    glowColor: 'rgba(107,114,128,0.20)',
    shimmer: false,
  };
  return {
    name: 'STANDARD',
    colors: ['#f3f4f6', '#d1d5db', '#9ca3af'],
    accent: '#9ca3af',
    textColor: '#374151',
    borderColor: '#6b7280',
    glowColor: 'rgba(156,163,175,0.15)',
    shimmer: false,
  };
}

// ─── Component ────────────────────────────────────────────

export default function UNDSRSlab({ grade, cardName, cardImageUri, subGrades, theme }: UNDSRSlabProps) {
  const tier = getTier(grade);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Shimmer animation for premium grades
  useEffect(() => {
    if (tier.shimmer) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: 2500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      shimmerAnim.setValue(0);
    }
  }, [tier.shimmer]);

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.08, 0.25, 0.08],
  });

  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  return (
    <View style={[styles.slabOuter, { shadowColor: tier.glowColor }]}>
      {/* Outer case — the "slab" body */}
      <View style={[styles.slabCase, { borderColor: tier.borderColor }]}>

        {/* ── Label Header (metallic gradient) ── */}
        <LinearGradient
          colors={tier.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.labelHeader}
        >
          {/* Shimmer overlay */}
          {tier.shimmer && (
            <Animated.View
              style={[
                styles.shimmerOverlay,
                {
                  opacity: shimmerOpacity,
                  transform: [{ translateX: shimmerTranslateX }],
                },
              ]}
            />
          )}

          {/* UNDSR branding */}
          <View style={styles.brandRow}>
            <Text style={[styles.brandText, { color: tier.textColor }]}>UNDSR</Text>
            <Text style={[styles.brandDot, { color: tier.accent }]}>◈</Text>
            <Text style={[styles.brandSubtext, { color: tier.textColor }]}>GRADING</Text>
          </View>

          {/* Main grade display */}
          <View style={styles.gradeRow}>
            <View style={[styles.gradePill, { backgroundColor: tier.textColor }]}>
              <Text style={[styles.gradeNumber, { color: tier.colors[0] }]}>
                {grade.toFixed(1)}
              </Text>
            </View>
            <Text style={[styles.tierName, { color: tier.textColor }]}>
              {tier.name}
            </Text>
          </View>

          {/* Card name */}
          {cardName && (
            <Text style={[styles.cardNameText, { color: tier.textColor }]} numberOfLines={2}>
              {cardName}
            </Text>
          )}
        </LinearGradient>

        {/* ── Card Window (transparent case area) ── */}
        <View style={[styles.cardWindow, { backgroundColor: theme.background }]}>
          {cardImageUri ? (
            <Image
              source={{ uri: cardImageUri }}
              style={styles.cardImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.cardPlaceholder}>
              <Text style={[styles.placeholderIcon, { color: theme.textDim }]}>◈</Text>
              <Text style={[styles.placeholderText, { color: theme.textDim }]}>
                CARD ENCASED
              </Text>
            </View>
          )}

          {/* Inner case border effect */}
          <View style={[styles.caseInnerBorder, { borderColor: tier.borderColor + '30' }]} />
        </View>

        {/* ── Sub-Grades Footer (stamped metal look) ── */}
        <LinearGradient
          colors={[tier.colors[2], tier.colors[1], tier.colors[0]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.subGradeFooter}
        >
          {subGrades.map((sg, i) => (
            <View key={sg.abbr} style={styles.subGradeItem}>
              <Text style={[styles.subGradeLabel, { color: tier.colors[0] + 'CC' }]}>
                {sg.abbr}
              </Text>
              <Text style={[styles.subGradeScore, { color: tier.colors[0] }]}>
                {sg.score.toFixed(1)}
              </Text>
              {i < subGrades.length - 1 && (
                <View style={[styles.subGradeDivider, { backgroundColor: tier.colors[0] + '30' }]} />
              )}
            </View>
          ))}
        </LinearGradient>

        {/* ── Bottom seal ── */}
        <View style={[styles.sealBar, { backgroundColor: tier.borderColor }]}>
          <Text style={[styles.sealText, { color: tier.colors[0] }]}>
            THE UNDESIRABLES · AI-POWERED GRADING · {new Date().getFullYear()}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  slabOuter: {
    marginTop: Spacing.lg,
    alignItems: 'center',
    // Outer glow
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  slabCase: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 2.5,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f8f9fa',
  },

  // Label header
  labelHeader: {
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    width: 200,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
  },
  brandText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 6,
    fontFamily: Platform.select({
      ios: 'System',
      android: 'sans-serif-black',
      web: '"SF Pro Display", "Inter", system-ui, sans-serif',
    }),
  },
  brandDot: {
    fontSize: 12,
    fontWeight: '900',
  },
  brandSubtext: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
    fontFamily: 'monospace',
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 6,
  },
  gradePill: {
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  gradeNumber: {
    fontSize: 26,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  tierName: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3,
    fontFamily: 'monospace',
  },
  cardNameText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
    fontFamily: 'monospace',
    opacity: 0.8,
    marginTop: 2,
  },

  // Card window
  cardWindow: {
    height: 200,
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cardImage: {
    width: '85%',
    height: '90%',
    borderRadius: 4,
  },
  cardPlaceholder: {
    alignItems: 'center',
    gap: 8,
    opacity: 0.4,
  },
  placeholderIcon: {
    fontSize: 32,
  },
  placeholderText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    fontFamily: 'monospace',
  },
  caseInnerBorder: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 1,
    borderRadius: 6,
  },

  // Sub-grade footer
  subGradeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  subGradeItem: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  subGradeLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'monospace',
    marginBottom: 1,
  },
  subGradeScore: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  subGradeDivider: {
    position: 'absolute',
    right: 0,
    top: 2,
    bottom: 2,
    width: 1,
  },

  // Bottom seal
  sealBar: {
    paddingVertical: 5,
    alignItems: 'center',
  },
  sealText: {
    fontSize: 6,
    fontWeight: '800',
    letterSpacing: 2,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  },
});
