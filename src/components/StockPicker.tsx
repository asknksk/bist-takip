import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from './AppAlert';
import { addCustomStock, deleteStock, getAllStocks } from '../db/stocksRepo';
import { Stock } from '../domain/types';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

interface StockPickerProps {
  stocks: Stock[];
  selectedStockId: number | null;
  onSelect: (stockId: number) => void;
  onStocksChanged: () => void;
}

export default function StockPicker({ stocks, selectedStockId, onSelect, onStocksChanged }: StockPickerProps) {
  const insets = useSafeAreaInsets();
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

  function closeModal() {
    setOpen(false);
    setQuery('');
    setNewStockName('');
  }

  async function handleAddCustomStock() {
    const symbol = query.trim().toUpperCase();
    if (!symbol) return;
    if (!newStockName.trim()) {
      showAlert('Hata', 'Lütfen hissenin adını da gir.');
      return;
    }
    try {
      await addCustomStock(symbol, newStockName.trim());
      const updated = await getAllStocks();
      onStocksChanged();
      const added = updated.find((s) => s.symbol === symbol);
      if (added) {
        onSelect(added.id);
      }
      closeModal();
    } catch (error) {
      showAlert('Hata', 'Bu hisse zaten ekli olabilir.');
    }
  }

  function handleLongPressRow(item: Stock) {
    if (!item.isCustom) return;
    showAlert('Hisseyi sil', `${item.symbol} listeden silinsin mi?`, [
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
            showAlert('Hata', message);
          }
        },
      },
    ]);
  }

  return (
    <View>
      <Pressable
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Hisse seç"
      >
        <Text style={selectedStock ? styles.triggerTextFilled : styles.triggerTextPlaceholder}>
          {selectedStock ? `${selectedStock.symbol} · ${selectedStock.name}` : 'Hisse seç'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={closeModal}>
        <View style={[styles.modalContainer, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Hisse kodu veya adı ara"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onSelect(item.id);
                  closeModal();
                }}
                onLongPress={() => handleLongPressRow(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.symbol} ${item.name}`}
              >
                <View style={styles.rowSymbolBadge}>
                  <Text style={styles.rowSymbolBadgeText}>{item.symbol.slice(0, 2)}</Text>
                </View>
                <View style={styles.rowTextGroup}>
                  <Text style={styles.rowSymbol}>{item.symbol}</Text>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              query.trim() ? (
                <View style={styles.addCustomBox}>
                  <Text style={styles.addCustomText}>
                    "{query.trim().toUpperCase()}" bulunamadı. Yeni hisse olarak eklemek ister misin?
                  </Text>
                  <TextInput
                    style={styles.searchInputStandalone}
                    placeholder="Hisse adı (örn. Şirket A.Ş.)"
                    placeholderTextColor={colors.textMuted}
                    value={newStockName}
                    onChangeText={setNewStockName}
                  />
                  <Pressable
                    style={styles.addButton}
                    onPress={handleAddCustomStock}
                    accessibilityRole="button"
                  >
                    <Text style={styles.addButtonText}>Ekle</Text>
                  </Pressable>
                </View>
              ) : null
            }
          />
          <Pressable
            style={[styles.closeButton, { marginBottom: insets.bottom }]}
            onPress={closeModal}
            accessibilityRole="button"
          >
            <Text style={styles.closeButtonText}>Kapat</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.minSize,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  triggerTextFilled: {
    color: colors.textPrimary,
    fontFamily: typography.fontMedium,
    fontSize: typography.body.fontSize,
    flexShrink: 1,
  },
  triggerTextPlaceholder: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.body.fontSize,
  },
  modalContainer: { flex: 1, paddingHorizontal: spacing.md, backgroundColor: colors.background },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  searchIcon: { marginRight: spacing.xs },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    minHeight: touchTarget.minSize,
    color: colors.textPrimary,
    fontFamily: typography.fontRegular,
    fontSize: typography.body.fontSize,
  },
  searchInputStandalone: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    minHeight: touchTarget.minSize,
    color: colors.textPrimary,
    fontFamily: typography.fontRegular,
    fontSize: typography.body.fontSize,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: touchTarget.minSize,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowSymbolBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowSymbolBadgeText: {
    color: colors.primary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.caption.fontSize,
  },
  rowTextGroup: { flex: 1 },
  rowSymbol: {
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
  },
  rowName: {
    color: colors.textSecondary,
    fontFamily: typography.fontRegular,
    fontSize: typography.label.fontSize,
  },
  closeButton: {
    minHeight: touchTarget.minSize,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: colors.primary,
    fontFamily: typography.fontMedium,
    fontSize: typography.body.fontSize,
  },
  addCustomBox: { marginTop: spacing.md },
  addCustomText: {
    color: colors.textSecondary,
    fontFamily: typography.fontRegular,
    fontSize: typography.body.fontSize,
    marginBottom: spacing.md,
  },
  addButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: touchTarget.minSize,
    justifyContent: 'center',
  },
  addButtonText: {
    color: colors.onPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
  },
});
