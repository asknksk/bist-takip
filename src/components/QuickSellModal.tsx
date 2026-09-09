import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PriceStepperInput, { formatPrice, parsePriceInput } from './PriceStepperInput';
import { showAlert } from './AppAlert';
import { addTransaction } from '../db/transactionsRepo';
import { validateSellQuantity } from '../domain/calculations';
import { PortfolioRow } from '../domain/types';
import { fetchCurrentPrice } from '../services/priceService';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface QuickSellModalProps {
  visible: boolean;
  item: PortfolioRow | null;
  onClose: () => void;
  onSold: () => void;
}

export default function QuickSellModal({ visible, item, onClose, onSold }: QuickSellModalProps) {
  const insets = useSafeAreaInsets();
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [priceLoading, setPriceLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible || !item) return;
    setQuantity(String(item.heldQuantity));
    setPrice('');
    setPriceLoading(true);
    let cancelled = false;
    fetchCurrentPrice(item.symbol)
      .then((fetchedPrice) => {
        if (!cancelled && fetchedPrice !== null) setPrice(formatPrice(fetchedPrice));
      })
      .finally(() => {
        if (!cancelled) setPriceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, item]);

  if (!item) return null;

  async function handleConfirm() {
    if (!item) return;
    const quantityNum = parsePriceInput(quantity);
    const priceNum = parsePriceInput(price);

    if (!Number.isFinite(quantityNum) || quantityNum <= 0) {
      showAlert('Hata', 'Adet pozitif bir sayı olmalı.');
      return;
    }
    if (!validateSellQuantity(item.heldQuantity, quantityNum)) {
      showAlert('Hata', `Elinde bu hisseden yalnızca ${item.heldQuantity} adet var.`);
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      showAlert('Hata', 'Fiyat pozitif bir sayı olmalı.');
      return;
    }

    setSubmitting(true);
    try {
      await addTransaction(item.stockId, 'sell', quantityNum, priceNum, todayIso(), nowHHMM());
      onSold();
      onClose();
    } catch (error) {
      showAlert('Hata', 'Satış kaydedilemedi. Lütfen tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { marginBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.title}>{item.symbol} Sat</Text>
          <Text style={styles.subtitle}>Elinde {item.heldQuantity} adet var</Text>

          <Text style={styles.label}>Adet</Text>
          <View style={styles.quantityRow}>
            <TextInput
              style={styles.quantityInput}
              keyboardType="numeric"
              value={quantity}
              onChangeText={setQuantity}
            />
            <Pressable
              style={styles.maxButton}
              onPress={() => setQuantity(String(item.heldQuantity))}
              accessibilityRole="button"
            >
              <Text style={styles.maxButtonText}>Tümü</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Fiyat (TL)</Text>
          <PriceStepperInput value={price} onChange={setPrice} loading={priceLoading} />

          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={onClose} accessibilityRole="button">
              <Text style={styles.cancelButtonText}>Vazgeç</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, submitting && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={submitting}
              accessibilityRole="button"
            >
              {submitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.confirmButtonText}>Sat</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.title.fontSize,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontRegular,
    fontSize: typography.label.fontSize,
    marginBottom: spacing.md,
  },
  label: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontFamily: typography.fontMedium,
    fontSize: typography.label.fontSize,
    color: colors.textSecondary,
  },
  quantityRow: { flexDirection: 'row', gap: spacing.sm },
  quantityInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: touchTarget.minSize,
    color: colors.textPrimary,
    fontFamily: typography.fontRegular,
    fontSize: typography.body.fontSize,
  },
  maxButton: {
    minHeight: touchTarget.minSize,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maxButtonText: {
    color: colors.primary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.label.fontSize,
  },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  cancelButton: {
    flex: 1,
    minHeight: touchTarget.minSize,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontFamily: typography.fontMedium,
    fontSize: typography.body.fontSize,
  },
  confirmButton: {
    flex: 1,
    minHeight: touchTarget.minSize,
    borderRadius: radius.md,
    backgroundColor: colors.loss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: { opacity: 0.6 },
  confirmButtonText: {
    color: colors.onPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
  },
});
