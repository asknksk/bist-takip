import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from './AppAlert';
import { addCustomStock, getAllStocks } from '../db/stocksRepo';
import { addTransaction } from '../db/transactionsRepo';
import { parseEnparaSheet, ParsedImportTransaction } from '../domain/importParser';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

interface ImportExcelModalProps {
  visible: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Step = 'pick' | 'preview' | 'importing' | 'done';

export default function ImportExcelModal({ visible, onClose, onImported }: ImportExcelModalProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedImportTransaction[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failedCount, setFailedCount] = useState(0);

  function reset() {
    setStep('pick');
    setFileName('');
    setParsed([]);
    setSkippedCount(0);
    setProgress({ done: 0, total: 0 });
    setFailedCount(0);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || result.assets.length === 0) return;

      const asset = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const workbook = XLSX.read(base64, { type: 'base64' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, raw: false });

      const { transactions, skippedCount: skipped } = parseEnparaSheet(rows);
      if (transactions.length === 0) {
        showAlert('Hata', 'Dosyada içe aktarılacak hisse alım/satım işlemi bulunamadı.');
        return;
      }

      setFileName(asset.name);
      setParsed(transactions);
      setSkippedCount(skipped);
      setStep('preview');
    } catch (error) {
      showAlert('Hata', 'Dosya okunamadı. Lütfen Enpara.com hesap hareketleri (.xls) dosyası seçtiğinden emin ol.');
    }
  }

  async function handleConfirmImport() {
    setStep('importing');
    setProgress({ done: 0, total: parsed.length });

    let stocks = await getAllStocks();
    let bySymbol = new Map(stocks.map((s) => [s.symbol.toUpperCase(), s]));

    const uniqueSymbols = Array.from(new Set(parsed.map((t) => t.symbol)));
    const missingSymbols = uniqueSymbols.filter((s) => !bySymbol.has(s));
    for (const symbol of missingSymbols) {
      try {
        await addCustomStock(symbol, symbol);
      } catch {
        // symbol may already exist from a concurrent/previous partial import; ignore
      }
    }
    if (missingSymbols.length > 0) {
      stocks = await getAllStocks();
      bySymbol = new Map(stocks.map((s) => [s.symbol.toUpperCase(), s]));
    }

    let failed = 0;
    let done = 0;
    for (const t of parsed) {
      const stock = bySymbol.get(t.symbol);
      if (stock) {
        try {
          await addTransaction(stock.id, t.type, t.quantity, t.price, t.date);
        } catch {
          failed += 1;
        }
      } else {
        failed += 1;
      }
      done += 1;
      setProgress({ done, total: parsed.length });
    }

    setFailedCount(failed);
    setStep('done');
    onImported();
  }

  function handleFinish() {
    reset();
    onClose();
  }

  const uniqueSymbolCount = new Set(parsed.map((t) => t.symbol)).size;
  const buyCount = parsed.filter((t) => t.type === 'buy').length;
  const sellCount = parsed.length - buyCount;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Excel'den İçe Aktar</Text>
          {step !== 'importing' && (
            <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel="Kapat" hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {step === 'pick' && (
            <View style={styles.centerBox}>
              <Ionicons name="document-attach-outline" size={48} color={colors.textMuted} />
              <Text style={styles.infoText}>
                Enpara.com'dan indirdiğin "Yatırım Hesap Hareketleri" (.xls) dosyasını seç. Hisse
                alım/satım işlemlerin otomatik olarak eklenecek.
              </Text>
              <Pressable style={styles.primaryButton} onPress={handlePickFile} accessibilityRole="button">
                <Ionicons name="folder-open-outline" size={18} color={colors.onPrimary} />
                <Text style={styles.primaryButtonText}>Dosya Seç</Text>
              </Pressable>
            </View>
          )}

          {step === 'preview' && (
            <View>
              <View style={styles.fileRow}>
                <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
                <Text style={styles.fileName} numberOfLines={1}>
                  {fileName}
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <SummaryLine label="Toplam işlem" value={`${parsed.length}`} />
                <SummaryLine label="Alım" value={`${buyCount}`} />
                <SummaryLine label="Satım" value={`${sellCount}`} />
                <SummaryLine label="Farklı hisse" value={`${uniqueSymbolCount}`} />
                {skippedCount > 0 && (
                  <SummaryLine
                    label="Atlanan satır"
                    value={`${skippedCount}`}
                    hint="Fon işlemi, transfer veya vergi kesintisi gibi hisse dışı kayıtlar"
                  />
                )}
              </View>

              <Text style={styles.warningText}>
                Bu dosyayı daha önce içe aktardıysan tekrar aktarmak işlemleri kopyalar. Emin
                değilsen önce Geçmiş sekmesinden kontrol et.
              </Text>

              <Pressable style={styles.primaryButton} onPress={handleConfirmImport} accessibilityRole="button">
                <Text style={styles.primaryButtonText}>{parsed.length} İşlemi İçe Aktar</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={reset} accessibilityRole="button">
                <Text style={styles.secondaryButtonText}>Farklı dosya seç</Text>
              </Pressable>
            </View>
          )}

          {step === 'importing' && (
            <View style={styles.centerBox}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.infoText}>
                İşlemler ekleniyor... {progress.done}/{progress.total}
              </Text>
            </View>
          )}

          {step === 'done' && (
            <View style={styles.centerBox}>
              <Ionicons name="checkmark-circle" size={48} color={colors.profit} />
              <Text style={styles.infoText}>
                {parsed.length - failedCount} işlem başarıyla eklendi.
                {failedCount > 0 ? `\n${failedCount} işlem eklenemedi.` : ''}
              </Text>
              <Pressable style={styles.primaryButton} onPress={handleFinish} accessibilityRole="button">
                <Text style={styles.primaryButtonText}>Tamam</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function SummaryLine({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.summaryLine}>
      <View style={styles.summaryLineRow}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
      {hint && <Text style={styles.summaryHint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.title.fontSize,
  },
  body: { flexGrow: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  infoText: {
    color: colors.textSecondary,
    fontFamily: typography.fontRegular,
    fontSize: typography.body.fontSize,
    textAlign: 'center',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  fileName: { color: colors.textSecondary, fontFamily: typography.fontRegular, fontSize: typography.label.fontSize, flexShrink: 1 },
  summaryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryLine: { paddingVertical: spacing.xs },
  summaryLineRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { color: colors.textSecondary, fontFamily: typography.fontMedium, fontSize: typography.body.fontSize },
  summaryValue: { color: colors.textPrimary, fontFamily: typography.fontSemiBold, fontSize: typography.body.fontSize },
  summaryHint: { color: colors.textMuted, fontFamily: typography.fontRegular, fontSize: typography.caption.fontSize, marginTop: 2 },
  warningText: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
    marginBottom: spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    minHeight: touchTarget.minSize,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  primaryButtonText: { color: colors.onPrimary, fontFamily: typography.fontSemiBold, fontSize: typography.body.fontSize },
  secondaryButton: {
    minHeight: touchTarget.minSize,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  secondaryButtonText: { color: colors.textSecondary, fontFamily: typography.fontMedium, fontSize: typography.body.fontSize },
});
