import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { getAllStocks } from '../db/stocksRepo';
import { getAllTransactions } from '../db/transactionsRepo';
import { calculatePortfolio } from '../domain/calculations';
import { PortfolioRow } from '../domain/types';

export default function PortfolioScreen() {
  const [rows, setRows] = useState<PortfolioRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getAllStocks(), getAllTransactions()]).then(([stocks, txs]) => {
        if (!cancelled) setRows(calculatePortfolio(stocks, txs));
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text>Henüz işlem yok.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.stockId)}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.symbol}>
            {item.symbol} — {item.name}
          </Text>
          <Text>Elde tutulan: {item.heldQuantity}</Text>
          <Text>Ortalama maliyet: {item.avgBuyPrice.toFixed(2)} TL</Text>
          <Text style={item.realizedPnL >= 0 ? styles.profit : styles.loss}>
            Gerçekleşen K/Z: {item.realizedPnL.toFixed(2)} TL
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, marginBottom: 12 },
  symbol: { fontWeight: 'bold', marginBottom: 4 },
  profit: { color: '#16a34a', fontWeight: '600' },
  loss: { color: '#dc2626', fontWeight: '600' },
});
