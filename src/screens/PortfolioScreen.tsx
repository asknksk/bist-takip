import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../components/AppAlert';
import QuickSellModal from '../components/QuickSellModal';
import { forceDeleteStock, getAllStocks } from '../db/stocksRepo';
import { getAllTransactions } from '../db/transactionsRepo';
import { calculatePortfolio } from '../domain/calculations';
import { PortfolioRow } from '../domain/types';
import { fetchCurrentPrices } from '../services/priceService';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';
import { formatCurrency } from '../utils/format';

// undefined = still fetching, null = fetch failed, number = last fetched price
type PriceMap = Map<string, number | null>;

function formatTime(d: Date): string {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export default function PortfolioScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);
  const [prices, setPrices] = useState<PriceMap>(new Map());
  const [pricesLoading, setPricesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sellItem, setSellItem] = useState<PortfolioRow | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [stocks, txs] = await Promise.all([getAllStocks(), getAllTransactions()]);
      const portfolio = calculatePortfolio(stocks, txs);
      setRows(portfolio);
      setLoading(false);

      // Pull-to-refresh (and every focus) only re-fetches prices for stocks
      // currently held — closed positions have no "current price" to show.
      const openSymbols = portfolio.filter((r) => r.heldQuantity > 0).map((r) => r.symbol);
      if (openSymbols.length > 0) {
        setPricesLoading(true);
        const priceMap = await fetchCurrentPrices(openSymbols);
        setPrices(priceMap);
        setPricesLoading(false);
        setLastUpdated(new Date());
      } else {
        setPrices(new Map());
      }
    } catch (error) {
      showAlert('Hata', 'Veriler yüklenemedi. Lütfen tekrar deneyin.');
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handlePullToRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const { openRows, closedRows } = useMemo(() => {
    const open = rows.filter((r) => r.heldQuantity > 0);
    const closed = rows.filter((r) => r.heldQuantity <= 0);
    return { openRows: open, closedRows: closed };
  }, [rows]);

  const { totalValue, missingPriceCount } = useMemo(() => {
    let total = 0;
    let missing = 0;
    for (const r of openRows) {
      const price = prices.get(r.symbol);
      if (typeof price === 'number') {
        total += r.heldQuantity * price;
      } else {
        missing += 1;
      }
    }
    return { totalValue: total, missingPriceCount: missing };
  }, [openRows, prices]);

  function handleDeleteStock(item: PortfolioRow) {
    showAlert(
      'Hisseyi Sil',
      `${item.symbol} ve bu hisseye ait tüm işlem kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await forceDeleteStock(item.stockId);
              load();
            } catch (error) {
              showAlert('Hata', 'Hisse silinemedi. Lütfen tekrar deneyin.');
            }
          },
        },
      ]
    );
  }

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

  function priceStateFor(symbol: string): number | null | undefined {
    if (!prices.has(symbol)) return pricesLoading ? undefined : null;
    return prices.get(symbol);
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handlePullToRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {openRows.length > 0 && (
        <View style={styles.totalCard}>
          <View style={styles.totalHeaderRow}>
            <Text style={styles.totalLabel}>Toplam Portföy Değeri</Text>
            {lastUpdated && (
              <Text style={styles.lastUpdatedText}>Güncelleme: {formatTime(lastUpdated)}</Text>
            )}
          </View>
          <Text style={styles.totalValue}>{formatCurrency(totalValue)} TL</Text>
          {missingPriceCount > 0 && (
            <Text style={styles.totalHint}>
              {missingPriceCount} hisse için fiyat alınamadı, toplama dahil edilmedi.
            </Text>
          )}
        </View>
      )}

      {openRows.map((item) => (
        <PortfolioCard
          key={item.stockId}
          item={item}
          currentPrice={priceStateFor(item.symbol)}
          onDelete={() => handleDeleteStock(item)}
          onSell={() => setSellItem(item)}
        />
      ))}

      {openRows.length === 0 && closedRows.length > 0 && (
        <View style={styles.emptyInline}>
          <Text style={styles.emptySubtext}>Açık pozisyonun yok.</Text>
        </View>
      )}

      {closedRows.length > 0 && (
        <View style={styles.closedSection}>
          <Pressable
            style={styles.closedHeader}
            onPress={() => setShowClosed((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showClosed }}
          >
            <Ionicons
              name={showClosed ? 'chevron-down' : 'chevron-forward'}
              size={18}
              color={colors.textSecondary}
            />
            <Text style={styles.closedHeaderText}>Kapanan Pozisyonlar ({closedRows.length})</Text>
          </Pressable>
          {showClosed &&
            closedRows.map((item) => (
              <PortfolioCard
                key={item.stockId}
                item={item}
                currentPrice={undefined}
                onDelete={() => handleDeleteStock(item)}
              />
            ))}
        </View>
      )}

      <QuickSellModal
        visible={sellItem !== null}
        item={sellItem}
        onClose={() => setSellItem(null)}
        onSold={load}
      />
    </ScrollView>
  );
}

function PortfolioCard({
  item,
  currentPrice,
  onDelete,
  onSell,
}: {
  item: PortfolioRow;
  currentPrice: number | null | undefined;
  onDelete: () => void;
  onSell?: () => void;
}) {
  const isRealizedProfit = item.realizedPnL >= 0;
  const unrealizedPnL =
    item.heldQuantity > 0 && typeof currentPrice === 'number'
      ? item.heldQuantity * (currentPrice - item.avgBuyPrice)
      : null;
  const isUnrealizedProfit = (unrealizedPnL ?? 0) >= 0;

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
        {onSell && (
          <Pressable
            style={styles.sellButton}
            onPress={onSell}
            accessibilityRole="button"
            accessibilityLabel={`${item.symbol} sat`}
          >
            <Ionicons name="trending-down" size={14} color={colors.loss} />
            <Text style={styles.sellButtonText}>Sat</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.deleteButton}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`${item.symbol} hissesini sil`}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={18} color={colors.destructive} />
        </Pressable>
      </View>

      <View style={styles.metricsRow}>
        <View>
          <Text style={styles.metricLabel}>Elde tutulan</Text>
          <Text style={styles.metricValue}>{item.heldQuantity}</Text>
        </View>
        <View>
          <Text style={styles.metricLabel}>Ortalama maliyet</Text>
          <Text style={styles.metricValue}>{formatCurrency(item.avgBuyPrice)} TL</Text>
        </View>
        {item.heldQuantity > 0 && (
          <View>
            <Text style={styles.metricLabel}>Güncel fiyat</Text>
            {currentPrice === undefined ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : currentPrice === null ? (
              <Text style={styles.metricValueMuted}>alınamadı</Text>
            ) : (
              <Text style={styles.metricValue}>{formatCurrency(currentPrice)} TL</Text>
            )}
          </View>
        )}
      </View>

      {unrealizedPnL !== null && (
        <View
          style={[styles.pnlPill, isUnrealizedProfit ? styles.pnlPillProfit : styles.pnlPillLoss]}
        >
          <Ionicons
            name={isUnrealizedProfit ? 'trending-up' : 'trending-down'}
            size={16}
            color={isUnrealizedProfit ? colors.profit : colors.loss}
          />
          <Text
            style={[styles.pnlText, { color: isUnrealizedProfit ? colors.profit : colors.loss }]}
          >
            Tahmini K/Z: {formatCurrency(unrealizedPnL)} TL
          </Text>
        </View>
      )}

      {item.soldQuantity > 0 ? (
        <View
          style={[
            styles.pnlPill,
            styles.pnlPillSecondary,
            isRealizedProfit ? styles.pnlPillProfit : styles.pnlPillLoss,
          ]}
        >
          <Ionicons
            name={isRealizedProfit ? 'trending-up' : 'trending-down'}
            size={16}
            color={isRealizedProfit ? colors.profit : colors.loss}
          />
          <Text
            style={[styles.pnlText, { color: isRealizedProfit ? colors.profit : colors.loss }]}
          >
            Satılan {item.soldQuantity} adetten gerçekleşen K/Z: {formatCurrency(item.realizedPnL)} TL
          </Text>
        </View>
      ) : (
        item.heldQuantity > 0 && (
          <Text style={styles.pnlFootnote}>Henüz satış yapılmadı.</Text>
        )
      )}
    </View>
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
  emptyInline: { alignItems: 'center', paddingVertical: spacing.lg },
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
  totalCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  totalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  totalLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontMedium,
    fontSize: typography.label.fontSize,
  },
  lastUpdatedText: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
  },
  totalValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontBold,
    fontSize: typography.display.fontSize,
  },
  totalHint: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
    marginTop: spacing.xs,
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
  sellButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: touchTarget.minSize,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sellButtonText: {
    color: colors.loss,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.label.fontSize,
  },
  deleteButton: {
    width: touchTarget.minSize,
    height: touchTarget.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md, flexWrap: 'wrap' },
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
  metricValueMuted: {
    color: colors.textMuted,
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
  pnlPillSecondary: { marginTop: spacing.xs },
  pnlPillProfit: { backgroundColor: 'rgba(34,197,94,0.12)' },
  pnlPillLoss: { backgroundColor: 'rgba(248,113,113,0.12)' },
  pnlText: { fontFamily: typography.fontSemiBold, fontSize: typography.label.fontSize },
  pnlFootnote: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
    marginTop: spacing.xs,
  },
  closedSection: { marginTop: spacing.sm },
  closedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.minSize,
    marginBottom: spacing.sm,
  },
  closedHeaderText: {
    color: colors.textSecondary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
  },
});
