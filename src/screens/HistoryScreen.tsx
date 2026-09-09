import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getAllStocks } from '../db/stocksRepo';
import { deleteTransaction, getAllTransactions } from '../db/transactionsRepo';
import { Stock, Transaction } from '../domain/types';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stocksById, setStocksById] = useState<Record<number, Stock>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([getAllStocks(), getAllTransactions()])
      .then(([stocks, txs]) => {
        setStocksById(Object.fromEntries(stocks.map((s) => [s.id, s])));
        setTransactions(txs);
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

  if (transactions.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="time-outline" size={40} color={colors.textMuted} />
        <Text style={styles.emptyText}>Henüz işlem yok.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={transactions}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}
      renderItem={({ item }) => {
        const stock = stocksById[item.stockId];
        const isBuy = item.type === 'buy';
        return (
          <View style={styles.card}>
            <View style={[styles.typeIcon, isBuy ? styles.typeIconBuy : styles.typeIconSell]}>
              <Ionicons
                name={isBuy ? 'arrow-down' : 'arrow-up'}
                size={18}
                color={isBuy ? colors.profit : colors.loss}
              />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.symbol}>
                {stock ? `${stock.symbol} — ${stock.name}` : 'Bilinmeyen hisse'}
              </Text>
              <Text style={styles.detail}>
                {isBuy ? 'Alım' : 'Satım'} · {item.quantity} adet · {item.price.toFixed(2)} TL
              </Text>
              <Text style={styles.date}>{item.date}</Text>
            </View>
            <Pressable
              style={styles.deleteButton}
              onPress={() => handleDelete(item.id)}
              accessibilityRole="button"
              accessibilityLabel="İşlemi sil"
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={20} color={colors.destructive} />
            </Pressable>
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
  },
  emptyText: {
    color: colors.textPrimary,
    fontFamily: typography.fontMedium,
    fontSize: typography.body.fontSize,
  },
  list: { padding: spacing.md, backgroundColor: colors.background },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconBuy: { backgroundColor: 'rgba(34,197,94,0.12)' },
  typeIconSell: { backgroundColor: 'rgba(248,113,113,0.12)' },
  cardBody: { flex: 1 },
  symbol: {
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
    marginBottom: 2,
  },
  detail: {
    color: colors.textSecondary,
    fontFamily: typography.fontRegular,
    fontSize: typography.label.fontSize,
    marginBottom: 2,
  },
  date: {
    color: colors.textMuted,
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
