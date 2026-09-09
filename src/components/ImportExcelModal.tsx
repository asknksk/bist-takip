import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { showAlert } from './AppAlert';
import StockPicker from './StockPicker';
import { addCustomStock, getAllStocks } from '../db/stocksRepo';
import { addTransaction } from '../db/transactionsRepo';
import { parseEnparaSheet, ParsedImportTransaction } from '../domain/importParser';
import { Stock, TransactionType } from '../domain/types';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

interface ImportExcelModalProps {
  visible: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Step = 'pick' | 'preview' | 'importing' | 'done';

interface PreviewRow {
  rowId: string;
  tx: ParsedImportTransaction;
  stockId: number | null; // null = symbol didn't match any known stock
}

function parseDateParts(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(iso: string): string {
  return parseDateParts(iso).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function resolveStockId(symbol: string, stocks: Stock[]): number | null {
  const upper = symbol.toUpperCase();
  return stocks.find((s) => s.symbol.toUpperCase() === upper)?.id ?? null;
}

export default function ImportExcelModal({ visible, onClose, onImported }: ImportExcelModalProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failedCount, setFailedCount] = useState(0);

  function reset() {
    setStep('pick');
    setFileName('');
    setRows([]);
    setSkippedCount(0);
    setEditingRowId(null);
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
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, raw: false });

      const { transactions, skippedCount: skipped } = parseEnparaSheet(sheetRows);
      if (transactions.length === 0) {
        console.error(
          '[ImportExcelModal] parsed 0 transactions. sheetNames=',
          workbook.SheetNames,
          'rowCount=',
          sheetRows.length,
          'skipped=',
          skipped,
          'first 10 rows=',
          JSON.stringify(sheetRows.slice(0, 10))
        );
        showAlert('Hata', 'Dosyada içe aktarılacak hisse alım/satım işlemi bulunamadı.');
        return;
      }

      const currentStocks = await getAllStocks();
      setStocks(currentStocks);
      setRows(
        transactions.map((tx, index) => ({
          rowId: `row-${index}`,
          tx,
          stockId: resolveStockId(tx.symbol, currentStocks),
        }))
      );
      setFileName(asset.name);
      setSkippedCount(skipped);
      setStep('preview');
    } catch (error) {
      console.error('[ImportExcelModal] file read/parse failed:', error);
      const detail = error instanceof Error ? error.message : String(error);
      showAlert(
        'Hata',
        `Dosya okunamadı. Lütfen Enpara.com hesap hareketleri (.xls) dosyası seçtiğinden emin ol.\n\n(Ayrıntı: ${detail})`
      );
    }
  }

  function handleStocksChanged() {
    getAllStocks().then((updated) => {
      setStocks(updated);
      // A newly added custom stock may resolve OTHER rows sharing the same
      // symbol, not just the one being edited right now.
      setRows((prev) =>
        prev.map((r) =>
          r.stockId === null ? { ...r, stockId: resolveStockId(r.tx.symbol, updated) } : r
        )
      );
    });
  }

  function updateRow(rowId: string, updates: Partial<PreviewRow>) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...updates } : r)));
  }

  async function handleConfirmImport() {
    setStep('importing');
    setProgress({ done: 0, total: rows.length });

    let currentStocks = stocks;
    let bySymbol = new Map(currentStocks.map((s) => [s.symbol.toUpperCase(), s]));

    // Rows the user never resolved fall back to the original behavior: a
    // custom stock gets created automatically from the parsed symbol.
    const stillUnresolved = rows.filter((r) => r.stockId === null);
    const missingSymbols = Array.from(new Set(stillUnresolved.map((r) => r.tx.symbol)));
    for (const symbol of missingSymbols) {
      if (bySymbol.has(symbol)) continue;
      try {
        await addCustomStock(symbol, symbol);
      } catch {
        // symbol may already exist from a concurrent/previous partial import; ignore
      }
    }
    if (missingSymbols.length > 0) {
      currentStocks = await getAllStocks();
      bySymbol = new Map(currentStocks.map((s) => [s.symbol.toUpperCase(), s]));
    }

    let failed = 0;
    let done = 0;
    for (const r of rows) {
      const stockId = r.stockId ?? bySymbol.get(r.tx.symbol.toUpperCase())?.id;
      if (stockId) {
        try {
          await addTransaction(stockId, r.tx.type, r.tx.quantity, r.tx.price, r.tx.date, r.tx.time);
        } catch {
          failed += 1;
        }
      } else {
        failed += 1;
      }
      done += 1;
      setProgress({ done, total: rows.length });
    }

    setFailedCount(failed);
    setStep('done');
    onImported();
  }

  function handleFinish() {
    reset();
    onClose();
  }

  const uniqueSymbolCount = useMemo(() => new Set(rows.map((r) => r.tx.symbol)).size, [rows]);
  const buyCount = rows.filter((r) => r.tx.type === 'buy').length;
  const sellCount = rows.length - buyCount;
  const unmatchedCount = rows.filter((r) => r.stockId === null).length;
  const editingRow = rows.find((r) => r.rowId === editingRowId) ?? null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom }]}>
        {editingRow ? (
          <RowEditor
            row={editingRow}
            stocks={stocks}
            onStocksChanged={handleStocksChanged}
            onCancel={() => setEditingRowId(null)}
            onSave={(updated) => {
              updateRow(editingRow.rowId, updated);
              setEditingRowId(null);
            }}
          />
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Excel'den İçe Aktar</Text>
              {step !== 'importing' && (
                <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel="Kapat" hitSlop={8}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>

            {step === 'pick' && (
              <ScrollView contentContainerStyle={styles.body}>
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
              </ScrollView>
            )}

            {step === 'preview' && (
              <>
                <ScrollView contentContainerStyle={styles.body}>
                  <View style={styles.fileRow}>
                    <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.fileName} numberOfLines={1}>
                      {fileName}
                    </Text>
                  </View>

                  <View style={styles.summaryCard}>
                    <SummaryLine label="Toplam işlem" value={`${rows.length}`} />
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

                  {unmatchedCount > 0 && (
                    <View style={styles.warningCard}>
                      <Ionicons name="warning-outline" size={18} color={colors.loss} />
                      <Text style={styles.warningCardText}>
                        {unmatchedCount} satırın hissesi listede tam eşleşmedi (yeni hisse olarak
                        eklenecek). Sembol yanlış okunduysa satıra dokunup düzeltebilirsin.
                      </Text>
                    </View>
                  )}

                  <Text style={styles.tableHint}>
                    Bir satıra dokunarak hisseyi, adedi, fiyatı veya tarihi düzenleyebilirsin.
                  </Text>

                  <View style={styles.table}>
                    {rows.map((r) => (
                      <PreviewRowCard key={r.rowId} row={r} onPress={() => setEditingRowId(r.rowId)} />
                    ))}
                  </View>
                </ScrollView>

                <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
                  <Pressable style={styles.primaryButton} onPress={handleConfirmImport} accessibilityRole="button">
                    <Text style={styles.primaryButtonText}>{rows.length} İşlemi İçe Aktar</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={reset} accessibilityRole="button">
                    <Text style={styles.secondaryButtonText}>Farklı dosya seç</Text>
                  </Pressable>
                </View>
              </>
            )}

            {step === 'importing' && (
              <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.centerBox}>
                  <ActivityIndicator color={colors.primary} size="large" />
                  <Text style={styles.infoText}>
                    İşlemler ekleniyor... {progress.done}/{progress.total}
                  </Text>
                </View>
              </ScrollView>
            )}

            {step === 'done' && (
              <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.centerBox}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.profit} />
                  <Text style={styles.infoText}>
                    {rows.length - failedCount} işlem başarıyla eklendi.
                    {failedCount > 0 ? `\n${failedCount} işlem eklenemedi.` : ''}
                  </Text>
                  <Pressable style={styles.primaryButton} onPress={handleFinish} accessibilityRole="button">
                    <Text style={styles.primaryButtonText}>Tamam</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

function PreviewRowCard({ row, onPress }: { row: PreviewRow; onPress: () => void }) {
  const isBuy = row.tx.type === 'buy';
  const matched = row.stockId !== null;
  return (
    <Pressable style={styles.rowCard} onPress={onPress} accessibilityRole="button">
      <View style={styles.rowCardTop}>
        <Text style={styles.rowCardDate}>{formatDisplayDate(row.tx.date)}</Text>
        <View style={[styles.typeBadge, isBuy ? styles.typeBadgeBuy : styles.typeBadgeSell]}>
          <Text style={[styles.typeBadgeText, { color: isBuy ? colors.profit : colors.loss }]}>
            {isBuy ? 'Alım' : 'Satım'}
          </Text>
        </View>
        <View style={[styles.statusBadge, matched ? styles.statusBadgeReady : styles.statusBadgeWarn]}>
          <Ionicons
            name={matched ? 'checkmark' : 'warning-outline'}
            size={12}
            color={matched ? colors.profit : colors.loss}
          />
          <Text style={[styles.statusBadgeText, { color: matched ? colors.profit : colors.loss }]}>
            {matched ? 'Hazır' : 'Eşleşmedi'}
          </Text>
        </View>
      </View>
      <View style={styles.rowCardBottom}>
        <Text style={styles.rowCardSymbol}>{row.tx.symbol}</Text>
        <Text style={styles.rowCardDetail}>
          {row.tx.quantity} adet · {row.tx.price.toFixed(2)} TL
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

function RowEditor({
  row,
  stocks,
  onStocksChanged,
  onCancel,
  onSave,
}: {
  row: PreviewRow;
  stocks: Stock[];
  onStocksChanged: () => void;
  onCancel: () => void;
  onSave: (updates: Partial<PreviewRow>) => void;
}) {
  const insets = useSafeAreaInsets();
  const [stockId, setStockId] = useState<number | null>(row.stockId);
  const [type, setType] = useState<TransactionType>(row.tx.type);
  const [quantity, setQuantity] = useState(String(row.tx.quantity));
  const [price, setPrice] = useState(String(row.tx.price));
  const [dateObj, setDateObj] = useState(parseDateParts(row.tx.date));
  const [showDatePicker, setShowDatePicker] = useState(false);

  function handleDateValueChange(_event: DateTimePickerChangeEvent, selected: Date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    setDateObj(selected);
  }

  function handleSave() {
    const quantityNum = Number(quantity.replace(',', '.'));
    const priceNum = Number(price.replace(',', '.'));
    if (!Number.isFinite(quantityNum) || quantityNum <= 0) {
      showAlert('Hata', 'Adet pozitif bir sayı olmalı.');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      showAlert('Hata', 'Fiyat pozitif bir sayı olmalı.');
      return;
    }
    const stock = stocks.find((s) => s.id === stockId);
    onSave({
      stockId,
      tx: {
        ...row.tx,
        symbol: stock ? stock.symbol : row.tx.symbol,
        type,
        quantity: quantityNum,
        price: priceNum,
        date: toIsoDate(dateObj),
      },
    });
  }

  return (
    <View style={styles.editorFlex}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Geri" hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>İşlemi Düzenle</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Hisse</Text>
        <StockPicker
          stocks={stocks}
          selectedStockId={stockId}
          onSelect={setStockId}
          onStocksChanged={onStocksChanged}
        />
        {stockId === null && (
          <Text style={styles.editorHint}>
            Excel'deki sembol: "{row.tx.symbol}" — doğru hisseyi seç ya da yeni hisse olarak ekle.
          </Text>
        )}

        <Text style={styles.label}>İşlem Türü</Text>
        <View style={styles.typeRow}>
          <Pressable
            style={[styles.typeButton, type === 'buy' && styles.typeButtonBuyActive]}
            onPress={() => setType('buy')}
            accessibilityRole="button"
          >
            <Text style={[styles.typeButtonText, type === 'buy' && styles.typeButtonTextActive]}>Alım</Text>
          </Pressable>
          <Pressable
            style={[styles.typeButton, type === 'sell' && styles.typeButtonSellActive]}
            onPress={() => setType('sell')}
            accessibilityRole="button"
          >
            <Text style={[styles.typeButtonText, type === 'sell' && styles.typeButtonTextActive]}>Satım</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Adet</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={quantity}
          onChangeText={setQuantity}
        />

        <Text style={styles.label}>Fiyat (TL)</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={price} onChangeText={setPrice} />

        <Text style={styles.label}>Tarih</Text>
        <Pressable style={styles.dateInput} onPress={() => setShowDatePicker(true)} accessibilityRole="button">
          <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.dateInputText}>{formatDisplayDate(toIsoDate(dateObj))}</Text>
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            value={dateObj}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            maximumDate={new Date()}
            onValueChange={handleDateValueChange}
            onDismiss={() => setShowDatePicker(false)}
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Pressable style={styles.primaryButton} onPress={handleSave} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>Kaydet</Text>
        </Pressable>
      </View>
    </View>
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
  editorFlex: { flex: 1 },
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
  body: { flexGrow: 1, paddingBottom: spacing.lg },
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
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  warningCardText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
  },
  tableHint: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
    marginBottom: spacing.sm,
  },
  table: { gap: spacing.xs },
  rowCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  rowCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  rowCardDate: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
    flex: 1,
  },
  typeBadge: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.pill },
  typeBadgeBuy: { backgroundColor: 'rgba(34,197,94,0.12)' },
  typeBadgeSell: { backgroundColor: 'rgba(248,113,113,0.12)' },
  typeBadgeText: { fontFamily: typography.fontSemiBold, fontSize: typography.caption.fontSize },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusBadgeReady: { backgroundColor: 'rgba(34,197,94,0.12)' },
  statusBadgeWarn: { backgroundColor: 'rgba(248,113,113,0.12)' },
  statusBadgeText: { fontFamily: typography.fontSemiBold, fontSize: typography.caption.fontSize },
  rowCardBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowCardSymbol: {
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
  },
  rowCardDetail: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typography.fontRegular,
    fontSize: typography.label.fontSize,
  },
  warningText: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
    marginBottom: spacing.lg,
  },
  footer: { paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
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
  label: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontFamily: typography.fontMedium,
    fontSize: typography.label.fontSize,
    color: colors.textSecondary,
  },
  editorHint: {
    marginTop: spacing.xs,
    color: colors.loss,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
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
});
