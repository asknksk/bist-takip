import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from './AppAlert';
import { getAllStocks } from '../db/stocksRepo';
import { deleteTransaction, getAllTransactions } from '../db/transactionsRepo';
import { calculatePortfolioRow, calculateSellPnLs } from '../domain/calculations';
import { PortfolioRow, Stock, Transaction } from '../domain/types';
import { fetchCurrentPrice } from '../services/priceService';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';
import { formatCurrency } from '../utils/format';

interface StockDetailModalProps {
  visible: boolean;
  stockId: number | null;
  dateRange?: { from: string; to: string } | null;
  onClose: () => void;
  onChanged: () => void;
}

export default function StockDetailModal({
  visible,
  stockId,
  dateRange,
  onClose,
  onChanged,
}: StockDetailModalProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<Stock | null>(null);
  const [row, setRow] = useState<PortfolioRow | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null | undefined>(undefined);

  const load = useCallback(() => {
    if (!stockId) return;
    setLoading(true);
    Promise.all([getAllStocks(), getAllTransactions()])
      .then(([stocks, allTxs]) => {
        const foundStock = stocks.find((s) => s.id === stockId) ?? null;
        setStock(foundStock);
        const stockTxs = allTxs
          .filter((t) => t.stockId === stockId)
          .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
        setTransactions(stockTxs);
        if (foundStock) {
          const portfolioRow = calculatePortfolioRow(foundStock, allTxs);
          setRow(portfolioRow);
          setCurrentPrice(undefined);
          if (portfolioRow.heldQuantity > 0) {
            fetchCurrentPrice(foundStock.symbol).then(setCurrentPrice);
          }
        }
      })
      .catch(() => {
        showAlert('Hata', 'Veriler yüklenemedi. Lütfen tekrar deneyin.');
      })
      .finally(() => setLoading(false));
  }, [stockId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  function handleDeleteTransaction(id: number) {
    showAlert('İşlemi Sil', 'Bu işlemi silmek istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTransaction(id);
            load();
            onChanged();
          } catch (error) {
            showAlert('Hata', 'İşlem silinemedi. Lütfen tekrar deneyin.');
          }
        },
      },
    ]);
  }

  const unrealizedPnL =
    row && row.heldQuantity > 0 && typeof currentPrice === 'number'
      ? row.heldQuantity * (currentPrice - row.avgBuyPrice)
      : null;

  const displayedTransactions = useMemo(() => {
    if (!dateRange) return transactions;
    return transactions.filter((t) => t.date >= dateRange.from && t.date <= dateRange.to);
  }, [transactions, dateRange]);

  const rangeRealized = useMemo(() => {
    if (!dateRange || !stock) return null;
    // Uses the same moving-average-cost per-sell P&L as the rest of the
    // app (calculateSellPnLs) rather than a single blended avgBuyPrice —
    // a stock with multiple buy/sell round trips needs each sell matched
    // to its own point-in-time cost basis, not one number for all of them.
    const sellPnLs = calculateSellPnLs([stock], transactions).filter(
      (s) => s.date >= dateRange.from && s.date <= dateRange.to
    );
    const soldQuantity = sellPnLs.reduce((acc, s) => acc + s.quantity, 0);
    const realizedPnL = sellPnLs.reduce((acc, s) => acc + s.realizedPnL, 0);
    return { soldQuantity, realizedPnL };
  }, [dateRange, transactions, stock]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{stock ? `${stock.symbol} — ${stock.name}` : ''}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {row && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <SummaryItem label="Elde tutulan" value={String(row.heldQuantity)} />
                  <SummaryItem
                    label="Ortalama maliyet"
                    value={`${formatCurrency(row.avgBuyPrice)} TL`}
                    hint={`Toplam: ${formatCurrency(row.heldQuantity * row.avgBuyPrice)} TL`}
                  />
                </View>
                {row.heldQuantity > 0 && (
                  <View style={styles.summaryRow}>
                    <SummaryItem
                      label="Güncel fiyat"
                      value={
                        currentPrice === undefined
                          ? '...'
                          : currentPrice === null
                            ? 'alınamadı'
                            : `${formatCurrency(currentPrice)} TL`
                      }
                    />
                    {unrealizedPnL !== null && (
                      <SummaryItem
                        label="Tahmini K/Z"
                        value={`${formatCurrency(unrealizedPnL)} TL`}
                        color={unrealizedPnL >= 0 ? colors.profit : colors.loss}
                      />
                    )}
                  </View>
                )}
                {dateRange
                  ? rangeRealized &&
                    rangeRealized.soldQuantity > 0 && (
                      <View style={styles.summaryRow}>
                        <SummaryItem
                          label={`Seçilen aralıkta satılan ${rangeRealized.soldQuantity} adetten K/Z`}
                          value={`${formatCurrency(rangeRealized.realizedPnL)} TL`}
                          color={rangeRealized.realizedPnL >= 0 ? colors.profit : colors.loss}
                        />
                      </View>
                    )
                  : row.soldQuantity > 0 && (
                      <View style={styles.summaryRow}>
                        <SummaryItem
                          label={`Satılan ${row.soldQuantity} adetten K/Z`}
                          value={`${formatCurrency(row.realizedPnL)} TL`}
                          color={row.realizedPnL >= 0 ? colors.profit : colors.loss}
                        />
                      </View>
                    )}
              </View>
            )}

            <Text style={styles.sectionTitle}>
              {dateRange
                ? `İşlem Geçmişi — Seçilen Aralık (${displayedTransactions.length})`
                : `İşlem Geçmişi (${displayedTransactions.length})`}
            </Text>
            {dateRange && displayedTransactions.length === 0 && (
              <Text style={styles.emptyRangeText}>Bu tarih aralığında işlem yok.</Text>
            )}
            {displayedTransactions.map((t) => {
              const isBuy = t.type === 'buy';
              return (
                <View key={t.id} style={styles.txRow}>
                  <View style={[styles.typeIcon, isBuy ? styles.typeIconBuy : styles.typeIconSell]}>
                    <Ionicons
                      name={isBuy ? 'arrow-down' : 'arrow-up'}
                      size={16}
                      color={isBuy ? colors.profit : colors.loss}
                    />
                  </View>
                  <View style={styles.txBody}>
                    <Text style={styles.txDetail}>
                      {isBuy ? 'Alım' : 'Satım'} · {t.quantity} adet · {formatCurrency(t.price)} TL
                    </Text>
                    <Text style={styles.txDate}>{t.date}</Text>
                  </View>
                  <Pressable
                    style={styles.txDeleteButton}
                    onPress={() => handleDeleteTransaction(t.id)}
                    accessibilityRole="button"
                    accessibilityLabel="İşlemi sil"
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function SummaryItem({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, color ? { color } : null]}>{value}</Text>
      {hint && <Text style={styles.summaryHint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.title.fontSize,
    marginRight: spacing.md,
  },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingBottom: spacing.xl },
  summaryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginBottom: spacing.sm },
  summaryItem: { minWidth: 120 },
  summaryLabel: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
    marginBottom: 2,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
  },
  summaryHint: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
    marginTop: 1,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
    marginBottom: spacing.sm,
  },
  emptyRangeText: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.label.fontSize,
    marginBottom: spacing.sm,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  typeIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconBuy: { backgroundColor: 'rgba(34,197,94,0.12)' },
  typeIconSell: { backgroundColor: 'rgba(248,113,113,0.12)' },
  txBody: { flex: 1 },
  txDetail: {
    color: colors.textPrimary,
    fontFamily: typography.fontMedium,
    fontSize: typography.label.fontSize,
  },
  txDate: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
  },
  txDeleteButton: {
    width: touchTarget.minSize,
    height: touchTarget.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
