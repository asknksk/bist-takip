import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { getAllStocks } from '../db/stocksRepo';
import { deleteTransaction, getAllTransactions } from '../db/transactionsRepo';
import { Stock, Transaction } from '../domain/types';

export default function HistoryScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stocksById, setStocksById] = useState<Record<number, Stock>>({});

  const load = useCallback(() => {
    Promise.all([getAllStocks(), getAllTransactions()])
      .then(([stocks, txs]) => {
        setStocksById(Object.fromEntries(stocks.map((s) => [s.id, s])));
        setTransactions(txs);
      })
      .catch(() => {
        Alert.alert('Hata', 'Veriler yüklenemedi. Lütfen tekrar deneyin.');
      });
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

  if (transactions.length === 0) {
    return (
      <View style={styles.empty}>
        <Text>Henüz işlem yok.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={transactions}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const stock = stocksById[item.stockId];
        return (
          <View style={styles.card}>
            <Text style={styles.symbol}>
              {stock ? `${stock.symbol} — ${stock.name}` : 'Bilinmeyen hisse'}
            </Text>
            <Text>{item.type === 'buy' ? 'Alım' : 'Satım'} · {item.quantity} adet · {item.price.toFixed(2)} TL</Text>
            <Text>{item.date}</Text>
            <Pressable style={styles.deleteButton} onPress={() => handleDelete(item.id)}>
              <Text style={styles.deleteButtonText}>Sil</Text>
            </Pressable>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, marginBottom: 12 },
  symbol: { fontWeight: 'bold', marginBottom: 4 },
  deleteButton: { marginTop: 8, alignSelf: 'flex-start' },
  deleteButtonText: { color: '#dc2626', fontWeight: '600' },
});
