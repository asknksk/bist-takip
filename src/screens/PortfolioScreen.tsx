import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../components/AppAlert';
import { forceDeleteStock, getAllStocks } from '../db/stocksRepo';
import { getAllTransactions } from '../db/transactionsRepo';
import { calculatePortfolio } from '../domain/calculations';
import { PortfolioRow } from '../domain/types';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

export default function PortfolioScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(() => {
    Promise.all([getAllStocks(), getAllTransactions()])
      .then(([stocks, txs]) => {
        setRows(calculatePortfolio(stocks, txs));
      })
      .catch(() => {
        showAlert('Hata', 'Veriler yüklenemedi. Lütfen tekrar deneyin.');
      })
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const { openRows, closedRows } = useMemo(() => {
    const open = rows.filter((r) => r.heldQuantity > 0);
    const closed = rows.filter((r) => r.heldQuantity <= 0);
    return { openRows: open, closedRows: closed };
  }, [rows]);

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

  return (
    <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}>
      {openRows.map((item) => (
        <PortfolioCard key={item.stockId} item={item} onDelete={() => handleDeleteStock(item)} />
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
              <PortfolioCard key={item.stockId} item={item} onDelete={() => handleDeleteStock(item)} />
            ))}
        </View>
      )}
    </ScrollView>
  );
}

function PortfolioCard({ item, onDelete }: { item: PortfolioRow; onDelete: () => void }) {
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
          <Text style={styles.metricValue}>{item.avgBuyPrice.toFixed(2)} TL</Text>
        </View>
      </View>

      {item.soldQuantity > 0 ? (
        <>
          <View style={[styles.pnlPill, isProfit ? styles.pnlPillProfit : styles.pnlPillLoss]}>
            <Ionicons
              name={isProfit ? 'trending-up' : 'trending-down'}
              size={16}
              color={isProfit ? colors.profit : colors.loss}
            />
            <Text style={[styles.pnlText, { color: isProfit ? colors.profit : colors.loss }]}>
              Satılan {item.soldQuantity} adetten K/Z: {item.realizedPnL.toFixed(2)} TL
            </Text>
          </View>
          {item.heldQuantity > 0 && (
            <Text style={styles.pnlFootnote}>
              Elindeki {item.heldQuantity} adet için güncel fiyat takip edilmiyor.
            </Text>
          )}
        </>
      ) : (
        <Text style={styles.pnlFootnote}>Henüz satış yapılmadı — güncel fiyat takip edilmiyor.</Text>
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
  deleteButton: {
    width: touchTarget.minSize,
    height: touchTarget.minSize,
    alignItems: 'center',
    justifyContent: 'center',
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
