/**
 * 🔮 ForecastPanel — conformal 30-day risk forecast for a card, via the FREE
 * oracle endpoint (honest VaR + Safe-Hold/Momentum letter grades).
 * Self-contained: give it a card name; it resolves, fetches, and renders —
 * or renders nothing when the card isn't covered. Used by Index + Grade tabs.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { fetchCardForecast, CardForecast } from '@/lib/api';
import { Spacing, BorderRadius } from '@/constants/Theme';
import { openUrl } from '@/lib/open-url';

const gradeColor = (g: string) =>
  g === 'NA' || g === '—' ? '#8a8f9c'
  : g.startsWith('A') ? '#22e584'
  : g.startsWith('B') ? '#b8e522'
  : g.startsWith('C') ? '#e5a922'
  : '#ff5d5d'; // D / F

export default function ForecastPanel({ cardName }: { cardName?: string | null }) {
  const [forecast, setForecast] = useState<CardForecast | null>(null);

  useEffect(() => {
    setForecast(null);
    if (!cardName) return;
    let live = true;
    fetchCardForecast(cardName).then(f => { if (live) setForecast(f); }).catch(() => {});
    return () => { live = false; };
  }, [cardName]);

  if (!forecast) return null;
  const moveColor = forecast.movePct >= 0 ? '#22e584' : '#ff5d5d';

  return (
    <TouchableOpacity
      style={{ marginTop: Spacing.sm, backgroundColor: 'rgba(190, 120, 255, 0.08)', padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: 'rgba(190, 120, 255, 0.3)', width: '100%' }}
      onPress={() => openUrl('https://the-undesirables.com/forecast')}
      activeOpacity={0.7}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 9, fontWeight: '800', color: '#be78ff', letterSpacing: 1 }}>🔮 30-DAY RISK FORECAST</Text>
        <Text style={{ fontSize: 14, fontWeight: '800', color: moveColor }}>
          {forecast.movePct >= 0 ? '+' : ''}{forecast.movePct.toFixed(1)}%
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ borderWidth: 1, borderColor: gradeColor(forecast.safeHold), borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: gradeColor(forecast.safeHold) }}>SAFE-HOLD {forecast.safeHold}</Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: gradeColor(forecast.momentum), borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: gradeColor(forecast.momentum) }}>MOMENTUM {forecast.momentum}</Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: '#8a8f9c', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: '#8a8f9c' }}>{(forecast.regime || 'n/a').toUpperCase()}</Text>
        </View>
      </View>
      {forecast.plainEnglish ? (
        <Text style={{ fontSize: 10, color: '#c9b3e8', marginTop: 8, lineHeight: 14 }}>{forecast.plainEnglish}</Text>
      ) : null}
      <Text style={{ fontSize: 8, color: '#be78ff', marginTop: 6, opacity: 0.7 }}>
        CONFORMAL · HONEST VaR{forecast.momentum === 'NA' ? ' · MOMENTUM NA = DRIFT-SPIKE (NO-SIGNAL, NOT BULLISH)' : ''} · FREE ORACLE · TAP FOR FULL BOARD ↗
      </Text>
    </TouchableOpacity>
  );
}
