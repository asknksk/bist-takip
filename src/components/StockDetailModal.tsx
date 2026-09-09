import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from './AppAlert';
import { getAllStocks } from '../db/stocksRepo';
import { deleteTransaction, getAllTransactions } from '../db/transactionsRepo';
import { calculatePortfolioRow } from '../domain/calculations';
import { PortfolioRow, Stock, Transaction } from '../domain/types';
import { fetchCurrentPrice } from '../services/priceService';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

interface StockDetailModalProps {
  visible: boolean;
  stockId: number | null;
  onClose: () => void;
  onChanged: () => void;
}

export default function StockDetailModal({ visible, stockId, onClose, onChanged }: StockDetailModalProps) {
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
                    value={`${row.avgBuyPrice.toFixed(2)} TL`}
                    hint={`Toplam: ${(row.heldQuantity * row.avgBuyPrice).toFixed(2)} TL`}
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
                            : `${currentPrice.toFixed(2)} TL`
                      }
                    />
                    {unrealizedPnL !== null && (
                      <SummaryItem
                        label="Tahmini K/Z (gecikmeli)"
                        value={`${unrealizedPnL.toFixed(2)} TL`}
                        color={unrealizedPnL >= 0 ? colors.profit : colors.loss}
                      />
                    )}
                  </View>
                )}
                {row.soldQuantity > 0 && (
                  <View style={styles.summaryRow}>
                    <SummaryItem
                      label={`Satılan ${row.soldQuantity} adetten K/Z`}
                      value={`${row.realizedPnL.toFixed(2)} TL`}
                      color={row.realizedPnL >= 0 ? colors.profit : colors.loss}
                    />
                  </View>
                )}
              </View>
            )}

            <Text style={styles.sectionTitle}>İşlem Geçmişi ({transactions.length})</Text>
            {transactions.map((t) => {
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
                      {isBuy ? 'Alım' : 'Satım'} · {t.quantity} adet · {t.price.toFixed(2)} TL
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
