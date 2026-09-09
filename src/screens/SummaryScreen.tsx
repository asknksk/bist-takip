import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { getAllStocks } from '../db/stocksRepo';
import { getAllTransactions } from '../db/transactionsRepo';
import {
  calculateCumulativePnLOverTime,
  calculatePortfolio,
  calculateTotalRealizedPnL,
} from '../domain/calculations';
import { CumulativePnLPoint, PortfolioRow } from '../domain/types';
import { colors, radius, spacing, typography } from '../theme/theme';

const screenWidth = Dimensions.get('window').width - spacing.md * 2 - spacing.md * 2;

export default function SummaryScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [points, setPoints] = useState<CumulativePnLPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getAllStocks(), getAllTransactions()])
        .then(([stocks, txs]) => {
          if (cancelled) return;
          setRows(calculatePortfolio(stocks, txs));
          setPoints(calculateCumulativePnLOverTime(stocks, txs));
        })
        .catch(() => {
          if (!cancelled) Alert.alert('Hata', 'Veriler yüklenemedi. Lütfen tekrar deneyin.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const total = calculateTotalRealizedPnL(rows);
  const isProfit = total >= 0;

  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.lg }]}
    >
      <View style={styles.heroCard}>
        <Text style={styles.totalLabel}>Toplam Gerçekleşen Kar/Zarar</Text>
        <View style={styles.totalRow}>
          <Ionicons
            name={isProfit ? 'trending-up' : 'trending-down'}
            size={22}
            color={isProfit ? colors.profit : colors.loss}
          />
          <Text style={[styles.totalValue, { color: isProfit ? colors.profit : colors.loss }]}>
            {total.toFixed(2)} TL
          </Text>
        </View>
      </View>

      {rows.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>Hisse Bazında Kar/Zarar</Text>
          <BarChart
            data={{
              labels: rows.map((r) => r.symbol),
              datasets: [{ data: rows.map((r) => r.realizedPnL) }],
            }}
            width={screenWidth}
            height={220}
            yAxisLabel=""
            yAxisSuffix=" TL"
            chartConfig={chartConfig}
            fromZero
            style={styles.chart}
          />
        </View>
      )}

      {points.length > 1 && (
        <View style={styles.chartCard}>
          <Text style={styles.sectionTitle}>Zaman İçinde Kümülatif Kar/Zarar</Text>
          <LineChart
            data={{
              labels: points.map((p) => p.date.slice(5)),
              datasets: [{ data: points.map((p) => p.cumulativePnL) }],
            }}
            width={screenWidth}
            height={220}
            yAxisLabel=""
            yAxisSuffix=" TL"
            chartConfig={chartConfig}
            style={styles.chart}
            bezier
          />
        </View>
      )}

      {rows.length === 0 && (
        <View style={styles.emptyInline}>
          <Ionicons name="bar-chart-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>Henüz işlem yok.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const chartConfig = {
  backgroundGradientFrom: colors.surface,
  backgroundGradientTo: colors.surface,
  color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
  decimalPlaces: 0,
  propsForBackgroundLines: { stroke: 'rgba(255,255,255,0.06)' },
};

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  emptyInline: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { color: colors.textPrimary, fontFamily: typography.fontMedium, fontSize: typography.body.fontSize },
  container: { padding: spacing.md, backgroundColor: colors.background },
  heroCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  totalLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontMedium,
    fontSize: typography.label.fontSize,
    marginBottom: spacing.xs,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  totalValue: { fontFamily: typography.fontBold, fontSize: typography.display.fontSize },
  chartCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
    marginBottom: spacing.sm,
  },
  chart: { borderRadius: radius.md },
});
