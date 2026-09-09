import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAllStocks } from '../db/stocksRepo';
import { deleteTransaction, getAllTransactions } from '../db/transactionsRepo';
import { calculateDailyRealizedPnL } from '../domain/calculations';
import { Stock, Transaction } from '../domain/types';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

interface DayGroup {
  date: string;
  transactions: Transaction[];
  realizedPnL: number;
}

function formatDayLabel(dateIso: string): string {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  if (dateIso === todayIso) return 'Bugün';
  if (dateIso === yesterdayIso) return 'Dün';

  const [year, month, day] = dateIso.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stocksById, setStocksById] = useState<Record<number, Stock>>({});
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    Promise.all([getAllStocks(), getAllTransactions()])
      .then(([fetchedStocks, txs]) => {
        setStocks(fetchedStocks);
        setStocksById(Object.fromEntries(fetchedStocks.map((s) => [s.id, s])));
        setTransactions(txs);
        setExpandedDates((prev) => {
          if (prev.size > 0 || txs.length === 0) return prev;
          return new Set([txs[0].date]);
        });
      })
      .catch(() => {
        Alert.alert('Hata', 'Veriler yüklenemedi. Lütfen tekrar deneyin.');
      })
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const dayGroups = useMemo<DayGroup[]>(() => {
    const dailyPnL = calculateDailyRealizedPnL(stocks, transactions);
    const pnlByDate = new Map(dailyPnL.map((d) => [d.date, d.realizedPnL]));

    const txByDate = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const list = txByDate.get(t.date) ?? [];
      list.push(t);
      txByDate.set(t.date, list);
    }

    return Array.from(txByDate.entries())
      .map(([date, txs]) => ({ date, transactions: txs, realizedPnL: pnlByDate.get(date) ?? 0 }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [stocks, transactions]);

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  function handleDelete(id: number) {
    Alert.alert('İşlemi sil', 'Bu işlemi silmek istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTransaction(id);
            load();
          } catch (error) {
            Alert.alert('Hata', 'İşlem silinemedi. Lütfen tekrar deneyin.');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (dayGroups.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="time-outline" size={40} color={colors.textMuted} />
        <Text style={styles.emptyText}>Henüz işlem yok.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}
    >
      {dayGroups.map((group) => {
        const expanded = expandedDates.has(group.date);
        const isProfit = group.realizedPnL >= 0;
        const hasPnL = group.realizedPnL !== 0;
        return (
          <View key={group.date} style={styles.dayCard}>
            <Pressable
              style={styles.dayHeader}
              onPress={() => toggleDate(group.date)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${formatDayLabel(group.date)} işlemleri`}
            >
              <View style={styles.dayHeaderLeft}>
                <Ionicons
                  name={expanded ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                  color={colors.textSecondary}
                />
                <Text style={styles.dayLabel}>{formatDayLabel(group.date)}</Text>
                <Text style={styles.dayCount}>({group.transactions.length})</Text>
              </View>
              {hasPnL && (
                <View style={[styles.dayPnlPill, isProfit ? styles.pnlPillProfit : styles.pnlPillLoss]}>
                  <Ionicons
                    name={isProfit ? 'trending-up' : 'trending-down'}
                    size={14}
                    color={isProfit ? colors.profit : colors.loss}
                  />
                  <Text style={[styles.dayPnlText, { color: isProfit ? colors.profit : colors.loss }]}>
                    {group.realizedPnL.toFixed(2)} TL
                  </Text>
                </View>
              )}
            </Pressable>

            {expanded && (
              <View style={styles.dayBody}>
                {group.transactions.map((item, index) => {
                  const stock = stocksById[item.stockId];
                  const isBuy = item.type === 'buy';
                  const isLast = index === group.transactions.length - 1;
                  return (
                    <View key={item.id} style={[styles.txRow, isLast && styles.txRowLast]}>
                      <View style={[styles.typeIcon, isBuy ? styles.typeIconBuy : styles.typeIconSell]}>
                        <Ionicons
                          name={isBuy ? 'arrow-down' : 'arrow-up'}
                          size={16}
                          color={isBuy ? colors.profit : colors.loss}
                        />
                      </View>
                      <View style={styles.txBody}>
                        <Text style={styles.symbol}>
                          {stock ? `${stock.symbol} — ${stock.name}` : 'Bilinmeyen hisse'}
                        </Text>
                        <Text style={styles.detail}>
                          {isBuy ? 'Alım' : 'Satım'} · {item.quantity} adet · {item.price.toFixed(2)} TL
                        </Text>
                      </View>
                      <Pressable
                        style={styles.deleteButton}
                        onPress={() => handleDelete(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel="İşlemi sil"
                        hitSlop={8}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  emptyText: {
    color: colors.textPrimary,
    fontFamily: typography.fontMedium,
    fontSize: typography.body.fontSize,
  },
  list: { padding: spacing.md, backgroundColor: colors.background },
  dayCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.minSize,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dayHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  dayLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
  },
  dayCount: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.label.fontSize,
  },
  dayPnlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pnlPillProfit: { backgroundColor: 'rgba(34,197,94,0.12)' },
  pnlPillLoss: { backgroundColor: 'rgba(248,113,113,0.12)' },
  dayPnlText: { fontFamily: typography.fontSemiBold, fontSize: typography.caption.fontSize },
  dayBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txRowLast: { borderBottomWidth: 0 },
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
  symbol: {
    color: colors.textPrimary,
    fontFamily: typography.fontMedium,
    fontSize: typography.label.fontSize,
    marginBottom: 2,
  },
  detail: {
    color: colors.textSecondary,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
  },
  deleteButton: {
    width: touchTarget.minSize,
    height: touchTarget.minSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
