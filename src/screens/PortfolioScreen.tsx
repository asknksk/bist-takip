import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAllStocks } from '../db/stocksRepo';
import { getAllTransactions } from '../db/transactionsRepo';
import { calculatePortfolio } from '../domain/calculations';
import { PortfolioRow } from '../domain/types';
import { colors, radius, spacing, typography } from '../theme/theme';

export default function PortfolioScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getAllStocks(), getAllTransactions()])
        .then(([stocks, txs]) => {
          if (!cancelled) setRows(calculatePortfolio(stocks, txs));
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

  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="pie-chart-outline" size={40} color={colors.textMuted} />
        <Text style={styles.emptyText}>Henüz işlem yok.</Text>
        <Text style={styles.emptySubtext}>
          "İşlem Ekle" sekmesinden ilk alım/satımını gir.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.stockId)}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}
      renderItem={({ item }) => {
        const isProfit = item.realizedPnL >= 0;
        return (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.symbolBadge}>
                <Text style={styles.symbolBadgeText}>{item.symbol.slice(0, 2)}</Text>
              </View>
              <View style={styles.cardHeaderText}>
                <Text style={styles.symbol}>{item.symbol}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
            </View>

            <View style={styles.metricsRow}>
              <View>
                <Text style={styles.metricLabel}>Elde tutulan</Text>
                <Text style={styles.metricValue}>{item.heldQuantity}</Text>
              </View>
              <View>
                <Text style={styles.metricLabel}>Ortalama maliyet</Text>
                <Text style={styles.metricValue}>{item.avgBuyPrice.toFixed(2)} TL</Text>
              </View>
            </View>

            <View style={[styles.pnlPill, isProfit ? styles.pnlPillProfit : styles.pnlPillLoss]}>
              <Ionicons
                name={isProfit ? 'trending-up' : 'trending-down'}
                size={16}
                color={isProfit ? colors.profit : colors.loss}
              />
              <Text style={[styles.pnlText, { color: isProfit ? colors.profit : colors.loss }]}>
                Gerçekleşen K/Z: {item.realizedPnL.toFixed(2)} TL
              </Text>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    color: colors.textPrimary,
    fontFamily: typography.fontMedium,
    fontSize: typography.body.fontSize,
  },
  emptySubtext: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.label.fontSize,
    textAlign: 'center',
  },
  list: { padding: spacing.md, backgroundColor: colors.background },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  symbolBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolBadgeText: {
    color: colors.primary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.caption.fontSize,
  },
  cardHeaderText: { flex: 1 },
  symbol: {
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.title.fontSize,
  },
  name: {
    color: colors.textSecondary,
    fontFamily: typography.fontRegular,
    fontSize: typography.label.fontSize,
  },
  metricsRow: { flexDirection: 'row', gap: spacing.xl, marginBottom: spacing.md },
  metricLabel: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
    marginBottom: 2,
  },
  metricValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontMedium,
    fontSize: typography.body.fontSize,
  },
  pnlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  pnlPillProfit: { backgroundColor: 'rgba(34,197,94,0.12)' },
  pnlPillLoss: { backgroundColor: 'rgba(248,113,113,0.12)' },
  pnlText: { fontFamily: typography.fontSemiBold, fontSize: typography.label.fontSize },
});
