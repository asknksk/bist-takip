import { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addCustomStock, deleteStock } from '../db/stocksRepo';
import { Stock } from '../domain/types';

interface StockPickerProps {
  stocks: Stock[];
  selectedStockId: number | null;
  onSelect: (stockId: number) => void;
  onStocksChanged: () => void;
}

export default function StockPicker({ stocks, selectedStockId, onSelect, onStocksChanged }: StockPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [newStockName, setNewStockName] = useState('');

  const selectedStock = stocks.find((s) => s.id === selectedStockId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return stocks;
    return stocks.filter(
      (s) => s.symbol.toUpperCase().includes(q) || s.name.toUpperCase().includes(q)
    );
  }, [stocks, query]);

  async function handleAddCustomStock() {
    const symbol = query.trim().toUpperCase();
    if (!symbol) return;
    if (!newStockName.trim()) {
      Alert.alert('Hata', 'Lütfen hissenin adını da gir.');
      return;
    }
    try {
      await addCustomStock(symbol, newStockName.trim());
      onStocksChanged();
      setQuery('');
      setNewStockName('');
    } catch (error) {
      Alert.alert('Hata', 'Bu hisse zaten ekli olabilir.');
    }
  }

  function handleLongPressRow(item: Stock) {
    if (!item.isCustom) return;
    Alert.alert('Hisseyi sil', `${item.symbol} listeden silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteStock(item.id);
            onStocksChanged();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Hisse silinemedi.';
            Alert.alert('Hata', message);
          }
        },
      },
    ]);
  }

  return (
    <View>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text>
          {selectedStock ? `${selectedStock.symbol} - ${selectedStock.name}` : 'Hisse seç'}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Hisse kodu veya adı ara"
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onSelect(item.id);
                  setQuery('');
                  setOpen(false);
                }}
                onLongPress={() => handleLongPressRow(item)}
              >
                <Text style={styles.rowSymbol}>{item.symbol}</Text>
                <Text>{item.name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              query.trim() ? (
                <View style={styles.addCustomBox}>
                  <Text>"{query.trim().toUpperCase()}" bulunamadı. Yeni hisse olarak eklemek ister misin?</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Hisse adı (örn. Şirket A.Ş.)"
                    value={newStockName}
                    onChangeText={setNewStockName}
                  />
                  <Pressable style={styles.addButton} onPress={handleAddCustomStock}>
                    <Text style={styles.addButtonText}>Ekle</Text>
                  </Pressable>
                </View>
              ) : null
            }
          />
          <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
            <Text>Kapat</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  modalContainer: { flex: 1, paddingTop: 60, paddingHorizontal: 16 },
  searchInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 12 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowSymbol: { fontWeight: 'bold' },
  closeButton: { padding: 12, alignItems: 'center' },
  addCustomBox: { marginTop: 12 },
  addButton: { backgroundColor: '#3b82f6', padding: 12, borderRadius: 8, alignItems: 'center' },
  addButtonText: { color: 'white', fontWeight: 'bold' },
});
