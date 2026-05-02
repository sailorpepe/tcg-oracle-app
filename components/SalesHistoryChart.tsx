import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Spacing, FontSizes, BorderRadius } from '@/constants/Theme';

// ─── Types ────────────────────────────────────────────────

interface SalesDataPoint {
  date: Date;
  price: number;
  isOutlier?: boolean;
  isGraded?: boolean;
}

interface HistoricalPrice {
  date: string;  // "2026-04-03"
  market: number;
  low?: number;
  high?: number;
}

interface SalesHistoryChartProps {
  comps: SalesDataPoint[];
  historicalPrices?: HistoricalPrice[];
  theme: any;
}

// ─── Chart Constants ──────────────────────────────────────

const CHART_HEIGHT = 110;
const CHART_PADDING_TOP = 8;
const CHART_PADDING_BOTTOM = 4;
const USABLE_HEIGHT = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
const DOT_SIZE = 6;
const GLOW_SIZE = 14;
const PULSE_SIZE = 20;
const GRADIENT_STRIPS = 12;

// ─── Component ────────────────────────────────────────────

export default function SalesHistoryChart({ comps, historicalPrices, theme }: SalesHistoryChartProps) {
  // Pulse animation for latest data point
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const chartData = useMemo(() => {
    // ─── Resolve data source ───────────────────────────
    // Prefer historical prices if available (real TCGCSV data)
    let points: { date: Date; price: number }[] = [];
    let isHistorical = false;

    if (historicalPrices && historicalPrices.length >= 2) {
      points = historicalPrices
        .filter(p => p.market > 0)
        .map(p => ({ date: new Date(p.date), price: p.market }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      isHistorical = true;
    } else {
      // Fall back to eBay comps (market depth mode)
      points = comps
        .filter(c => !c.isOutlier && !c.isGraded)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map(c => ({ date: c.date, price: c.price }));
    }

    if (points.length < 2) return null;

    const prices = points.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;

    // ─── Stats ─────────────────────────────────────────
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[Math.floor(sorted.length / 2) - 1] + sorted[Math.floor(sorted.length / 2)]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    // ─── Trend detection ───────────────────────────────
    const third = Math.max(1, Math.floor(prices.length / 3));
    const earlyAvg = prices.slice(0, third).reduce((a, b) => a + b, 0) / third;
    const lateAvg = prices.slice(-third).reduce((a, b) => a + b, 0) / third;
    const trendPct = earlyAvg > 0 ? ((lateAvg - earlyAvg) / earlyAvg) * 100 : 0;
    const trending: 'up' | 'down' | 'stable' = trendPct > 5 ? 'up' : trendPct < -5 ? 'down' : 'stable';

    // ─── Coordinate mapping ────────────────────────────
    // Each point gets an (x%, y%) position within the chart area
    const totalSpan = points.length > 1
      ? points[points.length - 1].date.getTime() - points[0].date.getTime()
      : 1;

    const mapped = points.map((p, i) => {
      const xPct = totalSpan > 0
        ? ((p.date.getTime() - points[0].date.getTime()) / totalSpan) * 100
        : (i / (points.length - 1)) * 100;
      const yPct = ((p.price - minPrice) / range) * 100;
      return { ...p, xPct, yPct };
    });

    // ─── Line segments ─────────────────────────────────
    // Each segment connects point[i] to point[i+1]
    const segments = [];
    for (let i = 0; i < mapped.length - 1; i++) {
      const p1 = mapped[i];
      const p2 = mapped[i + 1];

      // Direction of this segment for coloring
      const segTrend = p2.price >= p1.price ? 'up' : 'down';

      segments.push({ x1: p1.xPct, y1: p1.yPct, x2: p2.xPct, y2: p2.yPct, segTrend });
    }

    const daySpan = Math.ceil(
      (points[points.length - 1].date.getTime() - points[0].date.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      points: mapped,
      segments,
      minPrice,
      maxPrice,
      avg,
      median,
      trending,
      trendPct,
      count: points.length,
      daySpan,
      isHistorical,
    };
  }, [comps, historicalPrices]);

  // ─── No data state ──────────────────────────────────
  if (!chartData) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.accent }]}>◈ MARKET DEPTH</Text>
        <Text style={[styles.noData, { color: theme.textMuted }]}>
          Not enough data to chart (need 2+ valid data points)
        </Text>
      </View>
    );
  }

  // ─── Derived values ─────────────────────────────────
  const trendColor = chartData.trending === 'up' ? '#22c55e' : chartData.trending === 'down' ? '#ef4444' : '#60a5fa';
  const trendIcon = chartData.trending === 'up' ? '▲' : chartData.trending === 'down' ? '▼' : '▬';
  const trendLabel = chartData.trending === 'up' ? 'RISING' : chartData.trending === 'down' ? 'FALLING' : 'STABLE';
  const lineColor = chartData.trending === 'up' ? '#22c55e' : chartData.trending === 'down' ? '#ef4444' : '#60a5fa';
  const fillColor = chartData.trending === 'up' ? '#22c55e' : chartData.trending === 'down' ? '#ef4444' : '#60a5fa';

  // Average line position
  const avgYPct = ((chartData.avg - chartData.minPrice) / (chartData.maxPrice - chartData.minPrice || 1)) * 100;

  // Y-axis labels (4 ticks for better granularity)
  const priceRange = chartData.maxPrice - chartData.minPrice;
  const yTicks = [
    chartData.maxPrice,
    chartData.minPrice + priceRange * 0.66,
    chartData.minPrice + priceRange * 0.33,
    chartData.minPrice,
  ];

  // Header text
  const headerText = chartData.isHistorical ? '◈ PRICE HISTORY' : '◈ MARKET DEPTH';
  const footerText = chartData.isHistorical
    ? `${chartData.count} snapshots · ${chartData.daySpan} day span`
    : `${chartData.count} data points · ${chartData.daySpan} day spread`;

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.accent }]}>{headerText}</Text>
        <View style={[styles.trendBadge, { backgroundColor: trendColor + '20', borderColor: trendColor }]}>
          <Text style={[styles.trendText, { color: trendColor }]}>
            {trendIcon} {Math.abs(chartData.trendPct).toFixed(1)}% {trendLabel}
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={[styles.statChip, { borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textDim }]}>AVG</Text>
          <Text style={[styles.statValue, { color: theme.textPrimary }]}>${chartData.avg.toFixed(2)}</Text>
        </View>
        <View style={[styles.statChip, { borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textDim }]}>MEDIAN</Text>
          <Text style={[styles.statValue, { color: theme.textPrimary }]}>${chartData.median.toFixed(2)}</Text>
        </View>
        <View style={[styles.statChip, { borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textDim }]}>LOW</Text>
          <Text style={[styles.statValue, { color: '#22c55e' }]}>${chartData.minPrice.toFixed(2)}</Text>
        </View>
        <View style={[styles.statChip, { borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textDim }]}>HIGH</Text>
          <Text style={[styles.statValue, { color: '#ef4444' }]}>${chartData.maxPrice.toFixed(2)}</Text>
        </View>
      </View>

      {/* Line chart */}
      <View style={styles.chartWrapper}>
        {/* Y-axis */}
        <View style={styles.yAxis}>
          {yTicks.map((tick, i) => (
            <Text key={i} style={[styles.yLabel, { color: theme.textDim }]}>
              ${tick >= 1000 ? (tick / 1000).toFixed(1) + 'k' : tick.toFixed(tick < 10 ? 2 : 0)}
            </Text>
          ))}
        </View>

        {/* Chart area */}
        <View style={[styles.chartArea, { borderColor: theme.border }]}>
          {/* Gradient fill under line */}
          {Array.from({ length: GRADIENT_STRIPS }).map((_, stripIdx) => {
            const stripYPct = (stripIdx / GRADIENT_STRIPS) * 100;
            const opacity = 0.15 * (1 - stripIdx / GRADIENT_STRIPS);

            // Find the leftmost and rightmost x where the line is above this strip
            let leftX = 100;
            let rightX = 0;
            let hasIntersection = false;

            for (const pt of chartData.points) {
              if (pt.yPct >= stripYPct) {
                if (pt.xPct < leftX) leftX = pt.xPct;
                if (pt.xPct > rightX) rightX = pt.xPct;
                hasIntersection = true;
              }
            }

            if (!hasIntersection) return null;

            return (
              <View
                key={`fill-${stripIdx}`}
                style={{
                  position: 'absolute',
                  bottom: `${stripYPct}%`,
                  left: `${leftX}%`,
                  right: `${100 - rightX}%`,
                  height: `${100 / GRADIENT_STRIPS + 1}%`,
                  backgroundColor: fillColor,
                  opacity,
                }}
              />
            );
          })}

          {/* Average reference line */}
          <View style={[styles.avgLine, { bottom: `${avgYPct}%`, borderColor: theme.accent + '35' }]}>
            <Text style={[styles.avgLabel, { color: theme.accent, backgroundColor: theme.surface }]}>AVG</Text>
          </View>

          {/* Line segments */}
          {chartData.segments.map((seg, i) => {
            // Calculate geometry for the segment line
            const dx = seg.x2 - seg.x1;
            const dy = seg.y2 - seg.y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(-dy, dx) * (180 / Math.PI); // Negative dy because bottom-up y axis
            const midX = (seg.x1 + seg.x2) / 2;
            const midY = (seg.y1 + seg.y2) / 2;
            const segColor = seg.segTrend === 'up' ? '#22c55e' : '#ef4444';

            return (
              <View
                key={`seg-${i}`}
                style={{
                  position: 'absolute',
                  left: `${seg.x1}%`,
                  bottom: `${midY}%`,
                  width: `${length}%`,
                  height: 2,
                  backgroundColor: segColor,
                  transform: [
                    { rotate: `${angle}deg` },
                  ],
                  transformOrigin: 'left center',
                  marginBottom: -1,
                  zIndex: 2,
                  shadowColor: segColor,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 3,
                } as any}
              />
            );
          })}

          {/* Data point dots */}
          {chartData.points.map((pt, i) => {
            const isLast = i === chartData.points.length - 1;
            const dotColor = i > 0
              ? (pt.price >= chartData.points[i - 1].price ? '#22c55e' : '#ef4444')
              : lineColor;

            return (
              <View key={`dot-${i}`}>
                {/* Glow ring */}
                <View
                  style={{
                    position: 'absolute',
                    left: `${pt.xPct}%`,
                    bottom: `${pt.yPct}%`,
                    width: GLOW_SIZE,
                    height: GLOW_SIZE,
                    borderRadius: GLOW_SIZE / 2,
                    backgroundColor: dotColor,
                    opacity: 0.15,
                    marginLeft: -GLOW_SIZE / 2,
                    marginBottom: -GLOW_SIZE / 2,
                    zIndex: 3,
                  }}
                />

                {/* Pulse ring on latest point */}
                {isLast && (
                  <Animated.View
                    style={{
                      position: 'absolute',
                      left: `${pt.xPct}%`,
                      bottom: `${pt.yPct}%`,
                      width: PULSE_SIZE,
                      height: PULSE_SIZE,
                      borderRadius: PULSE_SIZE / 2,
                      borderWidth: 1.5,
                      borderColor: dotColor,
                      opacity: pulseAnim,
                      marginLeft: -PULSE_SIZE / 2,
                      marginBottom: -PULSE_SIZE / 2,
                      zIndex: 4,
                    }}
                  />
                )}

                {/* Core dot */}
                <View
                  style={{
                    position: 'absolute',
                    left: `${pt.xPct}%`,
                    bottom: `${pt.yPct}%`,
                    width: DOT_SIZE,
                    height: DOT_SIZE,
                    borderRadius: DOT_SIZE / 2,
                    backgroundColor: dotColor,
                    marginLeft: -DOT_SIZE / 2,
                    marginBottom: -DOT_SIZE / 2,
                    zIndex: 5,
                    shadowColor: dotColor,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.8,
                    shadowRadius: 4,
                  }}
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* X-axis */}
      <View style={styles.xAxis}>
        <Text style={[styles.xLabel, { color: theme.textDim }]}>
          {chartData.points[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
        <Text style={[styles.xLabel, { color: theme.textMuted }]}>
          {footerText}
        </Text>
        <Text style={[styles.xLabel, { color: theme.textDim }]}>
          {chartData.points[chartData.points.length - 1].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
          <Text style={[styles.legendText, { color: theme.textDim }]}>Price up</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
          <Text style={[styles.legendText, { color: theme.textDim }]}>Price down</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.accent, opacity: 0.4 }]} />
          <Text style={[styles.legendText, { color: theme.textDim }]}>Avg line</Text>
        </View>
        {chartData.isHistorical && (
          <View style={styles.legendItem}>
            <Animated.View style={[styles.legendDot, {
              borderWidth: 1,
              borderColor: lineColor,
              backgroundColor: 'transparent',
              opacity: pulseAnim,
            }]} />
            <Text style={[styles.legendText, { color: theme.textDim }]}>Live</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: FontSizes.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  trendText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  noData: {
    fontSize: FontSizes.sm,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  chartWrapper: {
    flexDirection: 'row',
    marginTop: 4,
  },
  yAxis: {
    width: 42,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 4,
    paddingVertical: 2,
  },
  yLabel: {
    fontSize: 7,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  chartArea: {
    flex: 1,
    height: CHART_HEIGHT,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    position: 'relative',
    overflow: 'hidden',
    paddingTop: CHART_PADDING_TOP,
    paddingBottom: CHART_PADDING_BOTTOM,
  },
  avgLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed' as any,
    zIndex: 1,
  },
  avgLabel: {
    position: 'absolute',
    right: 4,
    top: -8,
    fontSize: 7,
    fontWeight: '800',
    fontFamily: 'monospace',
    paddingHorizontal: 2,
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 42,
  },
  xLabel: {
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 8,
    fontFamily: 'monospace',
  },
});
