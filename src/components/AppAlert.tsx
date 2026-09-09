import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

export interface AppAlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  variant: 'error' | 'success' | 'confirm' | 'info';
}

const INITIAL_STATE: AlertState = { visible: false, title: '', buttons: [], variant: 'info' };

type Listener = (state: AlertState) => void;
let listener: Listener | null = null;

/**
 * Themed drop-in replacement for React Native's Alert.alert. Mount
 * <AppAlertHost /> once near the app root; call showAlert(...) from
 * anywhere (including outside component render, like Alert.alert).
 */
export function showAlert(
  title: string,
  message?: string,
  buttons: AppAlertButton[] = [{ text: 'Tamam' }]
) {
  const variant: AlertState['variant'] =
    title === 'Hata'
      ? 'error'
      : title === 'Kaydedildi'
        ? 'success'
        : buttons.some((b) => b.style === 'destructive')
          ? 'confirm'
          : 'info';
  listener?.({ visible: true, title, message, buttons, variant });
}

const VARIANT_ICON: Record<AlertState['variant'], keyof typeof Ionicons.glyphMap> = {
  error: 'alert-circle',
  success: 'checkmark-circle',
  confirm: 'help-circle',
  info: 'information-circle',
};

const VARIANT_COLOR: Record<AlertState['variant'], string> = {
  error: colors.loss,
  success: colors.profit,
  confirm: colors.primary,
  info: colors.primary,
};

export function AppAlertHost() {
  const [state, setState] = useState<AlertState>(INITIAL_STATE);

  useEffect(() => {
    listener = setState;
    return () => {
      listener = null;
    };
  }, []);

  function close() {
    setState((s) => ({ ...s, visible: false }));
  }

  function handlePress(button: AppAlertButton) {
    close();
    button.onPress?.();
  }

  function handleRequestClose() {
    const cancelButton = state.buttons.find((b) => b.style === 'cancel');
    if (cancelButton) {
      handlePress(cancelButton);
    } else {
      close();
    }
  }

  return (
    <Modal visible={state.visible} transparent animationType="fade" onRequestClose={handleRequestClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Ionicons name={VARIANT_ICON[state.variant]} size={32} color={VARIANT_COLOR[state.variant]} />
          <Text style={styles.title}>{state.title}</Text>
          {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
          <View style={styles.buttonRow}>
            {state.buttons.map((button, index) => (
              <Pressable
                key={`${button.text}-${index}`}
                style={[
                  styles.button,
                  button.style === 'destructive' && styles.buttonDestructive,
                  button.style === 'cancel' && styles.buttonCancel,
                  state.buttons.length === 1 && styles.buttonFull,
                ]}
                onPress={() => handlePress(button)}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.buttonText,
                    button.style === 'destructive' && styles.buttonTextDestructive,
                    button.style === 'cancel' && styles.buttonTextCancel,
                  ]}
                >
                  {button.text}
                </Text>
              </Pressable>
            ))}
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  title: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.title.fontSize,
    textAlign: 'center',
  },
  message: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontFamily: typography.fontRegular,
    fontSize: typography.body.fontSize,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    width: '100%',
  },
  button: {
    flex: 1,
    minHeight: touchTarget.minSize,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonFull: { flex: 1 },
  buttonCancel: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  buttonDestructive: { backgroundColor: 'rgba(220,38,38,0.15)' },
  buttonText: {
    color: colors.onPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
  },
  buttonTextCancel: { color: colors.textSecondary },
  buttonTextDestructive: { color: colors.destructive },
});
