import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EULA_KEY = '@tcg_oracle_eula_accepted';
const EULA_VERSION = '1.0'; // bump this to re-show EULA after major license changes

/**
 * Full BUSL-1.1 license text matching tcg-oracle-app/LICENSE
 */
const LICENSE_FULL = `Business Source License 1.1

Parameters

Licensor:             The Undesirables LLC
Licensed Work:        TCG Oracle v1.1.0
                      The Licensed Work is (c) 2026 The Undesirables LLC
Additional Use Grant: You may make use of the Licensed Work for
                      non-commercial personal use, provided that you do
                      not distribute modified versions of the Licensed
                      Work as a competing commercial product.
Change Date:          2030-04-27
Change License:       Apache License, Version 2.0

For information about alternative licensing arrangements for the Licensed Work,
please contact: legal@the-undesirables.com

Notice

Business Source License 1.1 (BUSL-1.1)

Terms

The Licensor hereby grants you the right to copy, modify, create derivative
works, redistribute, and make non-production use of the Licensed Work. The
Licensor may make an Additional Use Grant, above, permitting limited production
use.

Effective on the Change Date, or the fourth anniversary of the first publicly
available distribution of a specific version of the Licensed Work under this
License, whichever comes first, the Licensor hereby grants you rights under the
terms of the Change License, and the rights granted in the paragraph above
terminate.

If your use of the Licensed Work does not comply with the requirements currently
in effect as described in this License, you must purchase a commercial license
from the Licensor, its affiliated entities, or authorized resellers, or you must
refrain from using the Licensed Work.

All copies of the original and modified Licensed Work, and derivative works of
the Licensed Work, are subject to this License. This License applies separately
for each version of the Licensed Work and the Change Date may vary for each
version of the Licensed Work released by Licensor.

You must conspicuously display this License on each original or modified copy of
the Licensed Work. If you receive the Licensed Work in original or modified form
from a third party, the terms and conditions set forth in this License apply to
your use of that work.

Any use of the Licensed Work in violation of this License will automatically
terminate your rights under this License for the current and all other versions
of the Licensed Work.

This License does not grant you any right in any trademark or logo of Licensor
or its affiliates (provided that you may use a trademark or logo of Licensor as
expressly required by this License).

TO THE EXTENT PERMITTED BY APPLICABLE LAW, THE LICENSED WORK IS PROVIDED ON AN
"AS IS" BASIS. LICENSOR HEREBY DISCLAIMS ALL WARRANTIES AND CONDITIONS, EXPRESS
OR IMPLIED, INCLUDING (WITHOUT LIMITATION) WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND TITLE.`;

interface LicenseAgreementProps {
  onAccept: () => void;
}

export default function LicenseAgreement({ onAccept }: LicenseAgreementProps) {
  const [expanded, setExpanded] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    Animated.timing(expandAnim, {
      toValue: next ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const handleAccept = async () => {
    try {
      await AsyncStorage.setItem(EULA_KEY, EULA_VERSION);
    } catch {}
    onAccept();
  };

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingBottom = 20;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingBottom) {
      setScrolledToBottom(true);
    }
  };

  const screenHeight = Dimensions.get('window').height;
  const expandedHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.min(screenHeight * 0.4, 400)],
  });

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.icon}>⚖️</Text>
          <Text style={styles.title}>License Agreement</Text>
          <Text style={styles.version}>BUSL-1.1</Text>
        </View>

        {/* Summary */}
        <ScrollView
          style={styles.summaryScroll}
          contentContainerStyle={styles.summaryContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.summaryTitle}>TCG Oracle — Business Source License 1.1</Text>

          <View style={styles.summaryCard}>
            <Text style={styles.cardLabel}>Licensor</Text>
            <Text style={styles.cardValue}>The Undesirables LLC</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.cardLabel}>What You Can Do</Text>
            <Text style={styles.cardValue}>
              ✓  Personal, non-commercial use{'\n'}
              ✓  Copy, modify, and create derivative works{'\n'}
              ✓  Research, education, and evaluation{'\n'}
              ✓  Non-production development and testing
            </Text>
          </View>

          <View style={[styles.summaryCard, styles.restrictionCard]}>
            <Text style={styles.cardLabel}>Restrictions</Text>
            <Text style={styles.cardValue}>
              ✗  No distributing modified versions as a competing commercial product{'\n'}
              ✗  No offering the Licensed Work as a hosted service for third parties
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.cardLabel}>Change Date</Text>
            <Text style={styles.cardValue}>
              On April 27, 2030 this software automatically becomes Apache 2.0 — fully open source.
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.cardLabel}>Commercial Licensing</Text>
            <Text style={styles.cardValue}>
              Contact legal@the-undesirables.com for commercial use arrangements.
            </Text>
          </View>

          {/* Expand/collapse full text */}
          <TouchableOpacity style={styles.expandToggle} onPress={toggleExpand} activeOpacity={0.7}>
            <Text style={styles.expandToggleText}>
              {expanded ? '▾ Hide Full License Text' : '▸ Show Full License Text'}
            </Text>
          </TouchableOpacity>

          {/* Full license text (expandable) */}
          <Animated.View style={[styles.fullTextContainer, { maxHeight: expandedHeight }]}>
            {expanded && (
              <ScrollView
                style={styles.fullTextScroll}
                onScroll={handleScroll}
                scrollEventThrottle={100}
                nestedScrollEnabled
              >
                <Text style={styles.fullText}>{LICENSE_FULL}</Text>
              </ScrollView>
            )}
          </Animated.View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerHint}>
            By clicking "I Accept", you agree to the terms of the Business Source License 1.1.
          </Text>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={handleAccept}
            activeOpacity={0.8}
          >
            <Text style={styles.acceptButtonText}>I Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * Check if the user has already accepted the current EULA version.
 */
export async function hasAcceptedEULA(): Promise<boolean> {
  try {
    const accepted = await AsyncStorage.getItem(EULA_KEY);
    return accepted === EULA_VERSION;
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#07070d',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    ...Platform.select({
      web: { position: 'fixed' as any },
    }),
  },
  container: {
    width: '92%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: '#0f0f1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(57, 255, 20, 0.15)',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 0 60px rgba(57, 255, 20, 0.08), 0 8px 32px rgba(0, 0, 0, 0.6)',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    gap: 10,
  },
  icon: {
    fontSize: 22,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e0e0e8',
    flex: 1,
    letterSpacing: 0.5,
  },
  version: {
    fontSize: 10,
    fontWeight: '700',
    color: '#39ff14',
    letterSpacing: 1.5,
    backgroundColor: 'rgba(57, 255, 20, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  summaryScroll: {
    maxHeight: Dimensions.get('window').height * 0.55,
  },
  summaryContent: {
    padding: 24,
    paddingTop: 20,
    gap: 12,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e0e0e8',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  summaryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  restrictionCard: {
    borderColor: 'rgba(239, 68, 68, 0.15)',
    backgroundColor: 'rgba(239, 68, 68, 0.03)',
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#39ff14',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  cardValue: {
    fontSize: 13,
    color: '#bbb',
    lineHeight: 20,
  },
  expandToggle: {
    paddingVertical: 8,
    marginTop: 4,
  },
  expandToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#39ff14',
    letterSpacing: 0.5,
  },
  fullTextContainer: {
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  fullTextScroll: {
    padding: 14,
  },
  fullText: {
    fontSize: 11,
    color: '#888',
    lineHeight: 17,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'SpaceMono',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    gap: 12,
  },
  footerHint: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
  },
  acceptButton: {
    backgroundColor: '#39ff14',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#07070d',
    letterSpacing: 1,
  },
});
