import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, DateData, LocaleConfig } from 'react-native-calendars';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

// Turkish locale: month/day names in Turkish, and the week starts on
// Monday (Pazartesi) — react-native-calendars defaults to Sunday-first
// with no locale configured, which looked wrong for a Turkish user.
LocaleConfig.locales.tr = {
  monthNames: [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ],
  monthNamesShort: [
    'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
    'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
  ],
  dayNames: [
    'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi',
  ],
  dayNamesShort: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
  today: 'Bugün',
};
LocaleConfig.defaultLocale = 'tr';

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isoToDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

interface MarkedDate {
  startingDay?: boolean;
  endingDay?: boolean;
  color: string;
  textColor: string;
}

function buildMarkedDates(start: string | null, end: string | null): Record<string, MarkedDate> {
  const marks: Record<string, MarkedDate> = {};
  if (!start) return marks;

  const effectiveEnd = end ?? start;
  const cursor = isoToDate(start);
  const endDate = isoToDate(effectiveEnd);

  while (cursor <= endDate) {
    const iso = toIsoDate(cursor);
    marks[iso] = {
      color: colors.primary,
      textColor: colors.onPrimary,
      startingDay: iso === start,
      endingDay: iso === effectiveEnd,
    };
    cursor.setDate(cursor.getDate() + 1);
  }
  return marks;
}

interface DateRangePickerModalProps {
  visible: boolean;
  initialFrom: Date | null;
  initialTo: Date | null;
  onClose: () => void;
  onApply: (from: Date | null, to: Date | null) => void;
}

export default function DateRangePickerModal({
  visible,
  initialFrom,
  initialTo,
  onClose,
  onApply,
}: DateRangePickerModalProps) {
  const insets = useSafeAreaInsets();
  const [start, setStart] = useState<string | null>(initialFrom ? toIsoDate(initialFrom) : null);
  const [end, setEnd] = useState<string | null>(initialTo ? toIsoDate(initialTo) : null);

  function handleDayPress(day: DateData) {
    const iso = day.dateString;
    if (!start || (start && end)) {
      setStart(iso);
      setEnd(null);
      return;
    }
    if (iso === start) {
      setEnd(iso);
    } else if (iso > start) {
      setEnd(iso);
    } else {
      setEnd(start);
      setStart(iso);
    }
  }

  function handleClear() {
    setStart(null);
    setEnd(null);
  }

  function handleApply() {
    onApply(start ? isoToDate(start) : null, end ? isoToDate(end) : start ? isoToDate(start) : null);
    onClose();
  }

  const markedDates = buildMarkedDates(start, end);

  let selectionLabel = 'Tarih seçilmedi';
  if (start && end && start !== end) {
    selectionLabel = `${start} – ${end}`;
  } else if (start) {
    selectionLabel = start;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.title}>Tarih Filtresi</Text>
          <Text style={styles.hint}>
            Tek bir gün seçmek için ona dokun. Aralık seçmek için ikinci bir güne dokun.
          </Text>

          <Calendar
            markingType="period"
            markedDates={markedDates}
            onDayPress={handleDayPress}
            maxDate={toIsoDate(new Date())}
            firstDay={1}
            theme={calendarTheme}
            style={styles.calendar}
          />

          <Text style={styles.selectionText}>{selectionLabel}</Text>

          <View style={styles.buttonRow}>
            <Pressable style={styles.clearButton} onPress={handleClear} accessibilityRole="button">
              <Text style={styles.clearButtonText}>Temizle</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={onClose} accessibilityRole="button">
              <Text style={styles.cancelButtonText}>Vazgeç</Text>
            </Pressable>
            <Pressable style={styles.applyButton} onPress={handleApply} accessibilityRole="button">
              <Text style={styles.applyButtonText}>Uygula</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const calendarTheme = {
  backgroundColor: colors.surface,
  calendarBackground: colors.surface,
  textSectionTitleColor: colors.textSecondary,
  selectedDayBackgroundColor: colors.primary,
  selectedDayTextColor: colors.onPrimary,
  todayTextColor: colors.primary,
  dayTextColor: colors.textPrimary,
  textDisabledColor: colors.textMuted,
  monthTextColor: colors.textPrimary,
  arrowColor: colors.primary,
  textDayFontFamily: typography.fontRegular,
  textMonthFontFamily: typography.fontSemiBold,
  textDayHeaderFontFamily: typography.fontMedium,
  textDayFontSize: 14,
  textMonthFontSize: 15,
  textDayHeaderFontSize: 12,
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
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
    marginBottom: spacing.xs,
  },
  hint: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
    marginBottom: spacing.md,
  },
  calendar: { borderRadius: radius.md, overflow: 'hidden' },
  selectionText: {
    color: colors.textSecondary,
    fontFamily: typography.fontMedium,
    fontSize: typography.label.fontSize,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  clearButton: {
    flex: 1,
    minHeight: touchTarget.minSize,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    color: colors.textSecondary,
    fontFamily: typography.fontMedium,
    fontSize: typography.body.fontSize,
  },
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
  applyButton: {
    flex: 1,
    minHeight: touchTarget.minSize,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    color: colors.onPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
  },
});
