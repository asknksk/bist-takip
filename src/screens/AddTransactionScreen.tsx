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
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import StockPicker from '../components/StockPicker';
import { getAllStocks } from '../db/stocksRepo';
import { addTransaction, getAllTransactions } from '../db/transactionsRepo';
import { calculatePortfolioRow, validateSellQuantity } from '../domain/calculations';
import { Stock, TransactionType } from '../domain/types';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function AddTransactionScreen() {
  const insets = useSafeAreaInsets();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [stockId, setStockId] = useState<number | null>(null);
  const [type, setType] = useState<TransactionType>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [dateObj, setDateObj] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'dismissed') return;
    if (selected) setDateObj(selected);
  }

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

    const date = toIsoDate(dateObj);

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

        <Text style={styles.label}>Tarih</Text>
        <Pressable
          style={styles.dateInput}
          onPress={() => setShowDatePicker(true)}
          accessibilityRole="button"
          accessibilityLabel="Tarih seç"
        >
          <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.dateInputText}>{formatDisplayDate(dateObj)}</Text>
        </Pressable>
        {showDatePicker && (
          <View style={Platform.OS === 'ios' ? styles.iosPickerCard : undefined}>
            <DateTimePicker
              value={dateObj}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={new Date()}
              onChange={handleDateChange}
            />
            {Platform.OS === 'ios' && (
              <Pressable style={styles.iosPickerDoneButton} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.iosPickerDoneText}>Tamam</Text>
              </Pressable>
            )}
          </View>
        )}

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
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: touchTarget.minSize,
  },
  dateInputText: {
    color: colors.textPrimary,
    fontFamily: typography.fontMedium,
    fontSize: typography.body.fontSize,
  },
  iosPickerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  iosPickerDoneButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget.minSize,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  iosPickerDoneText: {
    color: colors.primary,
    fontFamily: typography.fontSemiBold,
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
