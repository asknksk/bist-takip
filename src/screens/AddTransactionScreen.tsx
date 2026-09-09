import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import StockPicker from '../components/StockPicker';
import { getAllStocks } from '../db/stocksRepo';
import { addTransaction, getAllTransactions } from '../db/transactionsRepo';
import { calculatePortfolioRow, validateSellQuantity } from '../domain/calculations';
import { Stock, TransactionType } from '../domain/types';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AddTransactionScreen() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [stockId, setStockId] = useState<number | null>(null);
  const [type, setType] = useState<TransactionType>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(todayIso());

  const reloadStocks = useCallback(() => {
    getAllStocks()
      .then(setStocks)
      .catch(() => {
        Alert.alert('Hata', 'Veriler yüklenemedi. Lütfen tekrar deneyin.');
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reloadStocks();
    }, [reloadStocks])
  );

  async function handleSubmit() {
    const quantityNum = Number(quantity.replace(',', '.'));
    const priceNum = Number(price.replace(',', '.'));

    if (!stockId) {
      Alert.alert('Hata', 'Lütfen bir hisse seç.');
      return;
    }
    if (!Number.isFinite(quantityNum) || quantityNum <= 0) {
      Alert.alert('Hata', 'Adet pozitif bir sayı olmalı.');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      Alert.alert('Hata', 'Fiyat pozitif bir sayı olmalı.');
      return;
    }

    // Validate date format (YYYY-MM-DD)
    const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateFormatRegex.test(date)) {
      Alert.alert('Hata', 'Tarih YYYY-AA-GG formatında olmalı (örn. 2026-09-09).');
      return;
    }

    try {
      if (type === 'sell') {
        const stock = stocks.find((s) => s.id === stockId);
        if (!stock) {
          Alert.alert('Hata', 'Seçili hisse artık mevcut değil. Lütfen tekrar seç.');
          return;
        }
        const allTxs = await getAllTransactions();
        const row = calculatePortfolioRow(stock, allTxs);
        if (!validateSellQuantity(row.heldQuantity, quantityNum)) {
          Alert.alert('Hata', `Elinde bu hisseden yalnızca ${row.heldQuantity} adet var.`);
          return;
        }
      }

      await addTransaction(stockId, type, quantityNum, priceNum, date);
      Alert.alert('Kaydedildi', 'İşlem başarıyla eklendi.');
      setQuantity('');
      setPrice('');
    } catch (error) {
      Alert.alert('Hata', 'Veriler yüklenemedi. Lütfen tekrar deneyin.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Hisse</Text>
      <StockPicker
        stocks={stocks}
        selectedStockId={stockId}
        onSelect={setStockId}
        onStocksChanged={reloadStocks}
      />

      <Text style={styles.label}>İşlem Türü</Text>
      <View style={styles.typeRow}>
        <Pressable
          style={[styles.typeButton, type === 'buy' && styles.typeButtonActive]}
          onPress={() => setType('buy')}
        >
          <Text>Alım</Text>
        </Pressable>
        <Pressable
          style={[styles.typeButton, type === 'sell' && styles.typeButtonActive]}
          onPress={() => setType('sell')}
        >
          <Text>Satım</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Adet</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={quantity} onChangeText={setQuantity} />

      <Text style={styles.label}>Fiyat (TL)</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={price} onChangeText={setPrice} />

      <Text style={styles.label}>Tarih (YYYY-AA-GG)</Text>
      <TextInput style={styles.input} value={date} onChangeText={setDate} />

      <Pressable style={styles.submitButton} onPress={handleSubmit}>
        <Text style={styles.submitButtonText}>Kaydet</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  label: { marginTop: 12, marginBottom: 4, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeButton: { flex: 1, padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, alignItems: 'center' },
  typeButtonActive: { backgroundColor: '#dbeafe', borderColor: '#3b82f6' },
  submitButton: { marginTop: 24, backgroundColor: '#3b82f6', padding: 14, borderRadius: 8, alignItems: 'center' },
  submitButtonText: { color: 'white', fontWeight: 'bold' },
});
