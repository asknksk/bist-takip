import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
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
import DateTimePicker, { DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import StockPicker from '../components/StockPicker';
import ImportExcelModal from '../components/ImportExcelModal';
import PriceStepperInput, { formatPrice } from '../components/PriceStepperInput';
import { showAlert } from '../components/AppAlert';
import { getAllStocks } from '../db/stocksRepo';
import { addTransaction, getAllTransactions } from '../db/transactionsRepo';
import { calculatePortfolioRow, validateSellQuantity } from '../domain/calculations';
import { Stock, TransactionType } from '../domain/types';
import { fetchCurrentPrice } from '../services/priceService';
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

function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDisplayTime(d: Date): string {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
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
  const [timeObj, setTimeObj] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);

  useEffect(() => {
    if (!stockId) return;
    const stock = stocks.find((s) => s.id === stockId);
    if (!stock) return;

    let cancelled = false;
    setPriceLoading(true);
    fetchCurrentPrice(stock.symbol)
      .then((fetchedPrice) => {
        if (!cancelled && fetchedPrice !== null) {
          setPrice(formatPrice(fetchedPrice));
        }
      })
      .finally(() => {
        if (!cancelled) setPriceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stockId]);

  function handleDateValueChange(event: DateTimePickerChangeEvent, selected: Date) {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    setDateObj(selected);
  }

  function handleDatePickerDismiss() {
    setShowDatePicker(false);
  }

  function handleTimeValueChange(event: DateTimePickerChangeEvent, selected: Date) {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    setTimeObj(selected);
  }

  function handleTimePickerDismiss() {
    setShowTimePicker(false);
  }

  const reloadStocks = useCallback(() => {
    getAllStocks()
      .then(setStocks)
      .catch(() => {
        showAlert('Hata', 'Veriler yüklenemedi. Lütfen tekrar deneyin.');
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
      showAlert('Hata', 'Lütfen bir hisse seç.');
      return;
    }
    if (!Number.isFinite(quantityNum) || quantityNum <= 0) {
      showAlert('Hata', 'Adet pozitif bir sayı olmalı.');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      showAlert('Hata', 'Fiyat pozitif bir sayı olmalı.');
      return;
    }

    const date = toIsoDate(dateObj);
    const time = toHHMM(timeObj);

    setSubmitting(true);
    try {
      if (type === 'sell') {
        const stock = stocks.find((s) => s.id === stockId);
        if (!stock) {
          showAlert('Hata', 'Seçili hisse artık mevcut değil. Lütfen tekrar seç.');
          return;
        }
        const allTxs = await getAllTransactions();
        const row = calculatePortfolioRow(stock, allTxs);
        if (!validateSellQuantity(row.heldQuantity, quantityNum)) {
          showAlert('Hata', `Elinde bu hisseden yalnızca ${row.heldQuantity} adet var.`);
          return;
        }
      }

      await addTransaction(stockId, type, quantityNum, priceNum, date, time);
      showAlert('Kaydedildi', 'İşlem başarıyla eklendi.');
      setQuantity('');
      setPrice('');
    } catch (error) {
      showAlert('Hata', 'Veriler yüklenemedi. Lütfen tekrar deneyin.');
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
        <Pressable
          style={styles.importButton}
          onPress={() => setImportVisible(true)}
          accessibilityRole="button"
        >
          <Ionicons name="document-attach-outline" size={18} color={colors.primary} />
          <Text style={styles.importButtonText}>Excel'den İçe Aktar</Text>
        </Pressable>

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
        <PriceStepperInput value={price} onChange={setPrice} loading={priceLoading} />
        {stockId && (
          <Text style={styles.priceHint}>
            Fiyat, seçtiğin hissenin gecikmeli güncel fiyatıyla dolduruldu — dilersen +/- ile
            ayarla ya da elle yaz.
          </Text>
        )}

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
              onValueChange={handleDateValueChange}
              onDismiss={handleDatePickerDismiss}
            />
            {Platform.OS === 'ios' && (
              <Pressable style={styles.iosPickerDoneButton} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.iosPickerDoneText}>Tamam</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={styles.label}>Saat</Text>
        <Pressable
          style={styles.dateInput}
          onPress={() => setShowTimePicker(true)}
          accessibilityRole="button"
          accessibilityLabel="Saat seç"
        >
          <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.dateInputText}>{formatDisplayTime(timeObj)}</Text>
        </Pressable>
        <Text style={styles.priceHint}>
          Aynı güne ait birden fazla işlemin sırası saate göre belirlenir — geçmişe dönük işlem
          girerken doğru sırayı korumak için saat de önemlidir.
        </Text>
        {showTimePicker && (
          <View style={Platform.OS === 'ios' ? styles.iosPickerCard : undefined}>
            <DateTimePicker
              value={timeObj}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onValueChange={handleTimeValueChange}
              onDismiss={handleTimePickerDismiss}
            />
            {Platform.OS === 'ios' && (
              <Pressable style={styles.iosPickerDoneButton} onPress={() => setShowTimePicker(false)}>
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

      <ImportExcelModal
        visible={importVisible}
        onClose={() => setImportVisible(false)}
        onImported={reloadStocks}
      />
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
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.minSize,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  importButtonText: {
    color: colors.primary,
    fontFamily: typography.fontMedium,
    fontSize: typography.body.fontSize,
  },
  priceHint: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
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
