import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

const PRICE_STEP = 0.01;

export function parsePriceInput(raw: string): number {
  return Number(raw.replace(',', '.'));
}

export function formatPrice(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

interface PriceStepperInputProps {
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
}

export default function PriceStepperInput({ value, onChange, loading }: PriceStepperInputProps) {
  function step(delta: number) {
    const current = parsePriceInput(value || '0') || 0;
    onChange(formatPrice(Math.max(0, current + delta)));
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder="0,00"
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChange}
      />
      {loading && <ActivityIndicator size="small" color={colors.textMuted} style={styles.loadingIndicator} />}
      <View style={styles.stepperCol}>
        <Pressable
          style={styles.stepperButton}
          onPress={() => step(PRICE_STEP)}
          accessibilityRole="button"
          accessibilityLabel="Fiyatı artır"
          hitSlop={4}
        >
          <Ionicons name="add" size={16} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.stepperDivider} />
        <Pressable
          style={styles.stepperButton}
          onPress={() => step(-PRICE_STEP)}
          accessibilityRole="button"
          accessibilityLabel="Fiyatı azalt"
          hitSlop={4}
        >
          <Ionicons name="remove" size={16} color={colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    minHeight: touchTarget.minSize,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontFamily: typography.fontMedium,
    fontSize: typography.body.fontSize,
  },
  loadingIndicator: { alignSelf: 'center', marginRight: spacing.sm },
  stepperCol: {
    width: 40,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  stepperButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDivider: { height: 1, backgroundColor: colors.border },
});
