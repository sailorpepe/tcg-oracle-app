import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
  source?: 'mac_mini' | 'oracle_memory';
}

interface SalesHistoryChartProps {
  comps: SalesDataPoint[];
  historicalPrices?: HistoricalPrice[];
  isRealSoldData?: boolean;
  theme: any;
}

// ─── Chart Constants ──────────────────────────────────────

const CHART_HEIGHT = 120;
const BAR_COUNT = 20; // Max number of price bars to display
const BAR_GAP = 2;

// ─── Component ────────────────────────────────────────────

export default function SalesHistoryChart({ comps, historicalPrices, isRealSoldData, theme }: SalesHistoryChartProps) {

  const chartData = useMemo(() => {
    // ─── Resolve data source ───────────────────────────
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

    // ─── Bucket into bars ──────────────────────────────
    // If we have more points than BAR_COUNT, average them into buckets
    let bars: { date: Date; price: number; count: number }[];
    
    if (points.length <= BAR_COUNT) {
      bars = points.map(p => ({ date: p.date, price: p.price, count: 1 }));
    } else {
      const bucketSize = Math.ceil(points.length / BAR_COUNT);
      bars = [];
      for (let i = 0; i < points.length; i += bucketSize) {
        const bucket = points.slice(i, i + bucketSize);
        const avgPrice = bucket.reduce((a, b) => a + b.price, 0) / bucket.length;
        bars.push({
          date: bucket[Math.floor(bucket.length / 2)].date,
          price: avgPrice,
          count: bucket.length,
        });
      }
    }

    const prices = bars.map(b => b.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    // ─── Stats ─────────────────────────────────────────
    const allPrices = points.map(p => p.price);
    const avg = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
    const sorted = [...allPrices].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[Math.floor(sorted.length / 2) - 1] + sorted[Math.floor(sorted.length / 2)]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    // ─── Trend detection ───────────────────────────────
    const firstPrice = points[0].price;
    const lastPrice = points[points.length - 1].price;
    const priceDiff = lastPrice - firstPrice;
    const trendPct = firstPrice > 0 ? (priceDiff / firstPrice) * 100 : 0;
    const trending: 'up' | 'down' | 'stable' = trendPct > 5 ? 'up' : trendPct < -5 ? 'down' : 'stable';

    const daySpan = Math.ceil(
      (points[points.length - 1].date.getTime() - points[0].date.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      bars,
      minPrice,
      maxPrice,
      avg,
      median,
      firstPrice,
      lastPrice,
      priceDiff,
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
        <Text style={[styles.title, { color: theme.accent }]}>◈ PRICE TREND</Text>
        <Text style={[styles.noData, { color: theme.textMuted }]}>
          Not enough data to chart (need 2+ data points)
        </Text>
      </View>
    );
  }

  // ─── Derived values ─────────────────────────────────
  const trendColor = chartData.trending === 'up' ? '#22c55e' : chartData.trending === 'down' ? '#ef4444' : '#60a5fa';
  const trendIcon = chartData.trending === 'up' ? '▲' : chartData.trending === 'down' ? '▼' : '▬';
  const trendLabel = chartData.trending === 'up' ? 'UP' : chartData.trending === 'down' ? 'DOWN' : 'FLAT';

  const range = chartData.maxPrice - chartData.minPrice || 1;

  // Format price for display
  const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(2)}`;
  const fmtShort = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(v < 10 ? 2 : 0);

  // Header / source text
  const primarySource = chartData.isHistorical && historicalPrices?.length
    ? historicalPrices[0]?.source
    : undefined;
  const sourceText = chartData.isHistorical
    ? primarySource === 'oracle_memory'
      ? 'Oracle Memory (Your Searches)'
      : 'TCG Oracle Pipeline'
    : isRealSoldData
      ? 'eBay Sold Listings'
      : 'eBay Active Listings';
  const headerText = chartData.isHistorical
    ? '◈ PRICE HISTORY'
    : isRealSoldData
      ? '◈ SOLD HISTORY'
      : '◈ MARKET DEPTH';

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: theme.accent }]}>{headerText}</Text>
          <Text style={[styles.source, { color: theme.textDim }]}>{sourceText}</Text>
        </View>
        <View style={[styles.trendBadge, { backgroundColor: trendColor + '18', borderColor: trendColor }]}>
          <Text style={[styles.trendText, { color: trendColor }]}>
            {trendIcon} {Math.abs(chartData.trendPct).toFixed(1)}% {trendLabel}
          </Text>
        </View>
      </View>

      {/* Price summary — clear, easy to understand */}
      <View style={[styles.summaryRow, { borderColor: theme.border }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: theme.textDim }]}>EARLIEST</Text>
          <Text style={[styles.summaryValue, { color: theme.textSecondary }]}>{fmt(chartData.firstPrice)}</Text>
        </View>
        <View style={styles.summaryArrow}>
          <Text style={{ color: trendColor, fontSize: 16 }}>→</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: theme.textDim }]}>LATEST</Text>
          <Text style={[styles.summaryValue, { color: theme.textPrimary, fontWeight: '900' }]}>{fmt(chartData.lastPrice)}</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: theme.textDim }]}>CHANGE</Text>
          <Text style={[styles.summaryValue, { color: trendColor, fontWeight: '900' }]}>
            {chartData.priceDiff >= 0 ? '+' : ''}{fmt(chartData.priceDiff)}
          </Text>
        </View>
      </View>

      {/* Bar chart — simple and clean */}
      <View style={styles.chartSection}>
        {/* Y-axis labels */}
        <View style={styles.yAxis}>
          <Text style={[styles.yLabel, { color: theme.textDim }]}>${fmtShort(chartData.maxPrice)}</Text>
          <Text style={[styles.yLabel, { color: theme.textDim }]}>${fmtShort(chartData.minPrice + range * 0.5)}</Text>
          <Text style={[styles.yLabel, { color: theme.textDim }]}>${fmtShort(chartData.minPrice)}</Text>
        </View>

        {/* Bars */}
        <View style={[styles.chartArea, { borderColor: theme.border }]}>
          {/* Grid lines */}
          <View style={[styles.gridLine, { top: '0%', borderColor: theme.border }]} />
          <View style={[styles.gridLine, { top: '50%', borderColor: theme.border }]} />
          <View style={[styles.gridLine, { top: '100%', borderColor: theme.border }]} />

          {/* Average reference line */}
          {(() => {
            const avgPct = ((chartData.avg - chartData.minPrice) / range) * 100;
            return (
              <View style={[styles.avgLine, { bottom: `${avgPct}%` }]}>
                <View style={[styles.avgLineDash, { backgroundColor: theme.accent + '40' }]} />
                <View style={[styles.avgTag, { backgroundColor: theme.surface, borderColor: theme.accent + '40' }]}>
                  <Text style={[styles.avgTagText, { color: theme.accent }]}>AVG {fmt(chartData.avg)}</Text>
                </View>
              </View>
            );
          })()}

          {/* Bars */}
          <View style={styles.barsContainer}>
            {chartData.bars.map((bar, i) => {
              const heightPct = ((bar.price - chartData.minPrice) / range) * 85 + 8; // 8% min height
              const isLatest = i === chartData.bars.length - 1;
              const prevBar = i > 0 ? chartData.bars[i - 1] : null;
              const barColor = !prevBar ? trendColor : (bar.price >= prevBar.price ? '#22c55e' : '#ef4444');
              
              return (
                <View key={i} style={styles.barColumn}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${heightPct}%`,
                        backgroundColor: barColor + (isLatest ? 'DD' : '80'),
                        borderColor: barColor,
                      },
                    ]}
                  >
                    {/* Subtle gradient overlay on bar */}
                    <View style={[styles.barHighlight, { backgroundColor: barColor + '15' }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* X-axis dates */}
      <View style={styles.xAxis}>
        <Text style={[styles.xLabel, { color: theme.textDim }]}>
          {chartData.bars[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
        <Text style={[styles.xLabelCenter, { color: theme.textMuted }]}>
          {chartData.count} {chartData.isHistorical ? 'data points' : 'sales'} · {chartData.daySpan} days
        </Text>
        <Text style={[styles.xLabel, { color: theme.textDim }]}>
          {chartData.bars[chartData.bars.length - 1].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
      </View>

      {/* Simple stats footer */}
      <View style={styles.footerStats}>
        <View style={styles.footerStat}>
          <Text style={[styles.footerStatLabel, { color: theme.textDim }]}>Avg</Text>
          <Text style={[styles.footerStatValue, { color: theme.textSecondary }]}>{fmt(chartData.avg)}</Text>
        </View>
        <Text style={[styles.footerDot, { color: theme.textDim }]}>·</Text>
        <View style={styles.footerStat}>
          <Text style={[styles.footerStatLabel, { color: theme.textDim }]}>Median</Text>
          <Text style={[styles.footerStatValue, { color: theme.textSecondary }]}>{fmt(chartData.median)}</Text>
        </View>
        <Text style={[styles.footerDot, { color: theme.textDim }]}>·</Text>
        <View style={styles.footerStat}>
          <Text style={[styles.footerStatLabel, { color: theme.textDim }]}>Low</Text>
          <Text style={[styles.footerStatValue, { color: '#22c55e' }]}>{fmt(chartData.minPrice)}</Text>
        </View>
        <Text style={[styles.footerDot, { color: theme.textDim }]}>·</Text>
        <View style={styles.footerStat}>
          <Text style={[styles.footerStatLabel, { color: theme.textDim }]}>High</Text>
          <Text style={[styles.footerStatValue, { color: '#ef4444' }]}>{fmt(chartData.maxPrice)}</Text>
        </View>
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
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: FontSizes.xs,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  source: {
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
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

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    gap: 8,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryArrow: {
    paddingHorizontal: 2,
  },
  summaryLabel: {
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  summaryDivider: {
    width: 1,
    height: 28,
  },

  // Chart section
  chartSection: {
    flexDirection: 'row',
    marginTop: 4,
  },
  yAxis: {
    width: 40,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 4,
    paddingVertical: 2,
  },
  yLabel: {
    fontSize: 8,
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
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed' as any,
    zIndex: 0,
  },
  avgLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avgLineDash: {
    flex: 1,
    height: 1,
  },
  avgTag: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  avgTagText: {
    fontSize: 7,
    fontWeight: '800',
    fontFamily: 'monospace',
  },

  // Bars
  barsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    paddingBottom: 1,
    height: '100%',
    gap: BAR_GAP,
    zIndex: 1,
  },
  barColumn: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderTopWidth: 1.5,
    minHeight: 4,
  },
  barHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  // X-axis
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 40,
  },
  xLabel: {
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  xLabelCenter: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '500',
  },

  // Footer stats
  footerStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  footerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  footerStatLabel: {
    fontSize: 9,
    fontFamily: 'monospace',
  },
  footerStatValue: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  footerDot: {
    fontSize: 10,
  },
});
