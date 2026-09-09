import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import StockPicker from '../components/StockPicker';
import { getAllStocks } from '../db/stocksRepo';
import { addTransaction, getAllTransactions } from '../db/transactionsRepo';
import { calculatePortfolioRow, validateSellQuantity } from '../domain/calculations';
import { Stock, TransactionType } from '../domain/types';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AddTransactionScreen() {
  const insets = useSafeAreaInsets();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [stockId, setStockId] = useState<number | null>(null);
  const [type, setType] = useState<TransactionType>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);

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

    const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateFormatRegex.test(date)) {
      Alert.alert('Hata', 'Tarih YYYY-AA-GG formatında olmalı (örn. 2026-09-09).');
      return;
    }

    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
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
            accessibilityRole="button"
            accessibilityState={{ selected: type === 'buy' }}
            style={[styles.typeButton, type === 'buy' && styles.typeButtonBuyActive]}
            onPress={() => setType('buy')}
          >
            <Ionicons
              name="trending-up"
              size={18}
              color={type === 'buy' ? colors.profit : colors.textSecondary}
            />
            <Text style={[styles.typeButtonText, type === 'buy' && styles.typeButtonTextActive]}>
              Alım
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: type === 'sell' }}
            style={[styles.typeButton, type === 'sell' && styles.typeButtonSellActive]}
            onPress={() => setType('sell')}
          >
            <Ionicons
              name="trending-down"
              size={18}
              color={type === 'sell' ? colors.loss : colors.textSecondary}
            />
            <Text style={[styles.typeButtonText, type === 'sell' && styles.typeButtonTextActive]}>
              Satım
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Adet</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          value={quantity}
          onChangeText={setQuantity}
        />

        <Text style={styles.label}>Fiyat (TL)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="0,00"
          placeholderTextColor={colors.textMuted}
          value={price}
          onChangeText={setPrice}
        />

        <Text style={styles.label}>Tarih (YYYY-AA-GG)</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholderTextColor={colors.textMuted}
        />

        <Pressable
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting }}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.submitButtonText}>Kaydet</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.md },
  label: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontFamily: typography.fontMedium,
    fontSize: typography.label.fontSize,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: touchTarget.minSize,
    color: colors.textPrimary,
    fontFamily: typography.fontRegular,
    fontSize: typography.body.fontSize,
  },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: touchTarget.minSize,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonBuyActive: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: colors.profit },
  typeButtonSellActive: { backgroundColor: 'rgba(248,113,113,0.12)', borderColor: colors.loss },
  typeButtonText: {
    color: colors.textSecondary,
    fontFamily: typography.fontMedium,
    fontSize: typography.body.fontSize,
  },
  typeButtonTextActive: { color: colors.textPrimary },
  submitButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget.minSize,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: {
    color: colors.onPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
  },
});
