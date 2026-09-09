import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../components/AppAlert';
import StockDetailModal from '../components/StockDetailModal';
import { getAllStocks } from '../db/stocksRepo';
import { getAllTransactions } from '../db/transactionsRepo';
import {
  calculateDailyRealizedPnL,
  calculateMonthlyRealizedPnL,
  calculatePortfolio,
  calculateTotalRealizedPnL,
} from '../domain/calculations';
import { DailyPnL, MonthlyPnL, PortfolioRow } from '../domain/types';
import { colors, radius, spacing, touchTarget, typography } from '../theme/theme';

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mostRecentMondayIso(d: Date): string {
  const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  return toIsoDate(monday);
}

function sumPnLInRange(daily: DailyPnL[], fromIso: string, toIsoInclusive: string): number {
  return daily
    .filter((d) => d.date >= fromIso && d.date <= toIsoInclusive)
    .reduce((acc, d) => acc + d.realizedPnL, 0);
}

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function formatMonthLabel(monthIso: string): string {
  const [year, month] = monthIso.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export default function SummaryScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [daily, setDaily] = useState<DailyPnL[]>([]);
  const [monthly, setMonthly] = useState<MonthlyPnL[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStockId, setSelectedStockId] = useState<number | null>(null);

  const load = useCallback(() => {
    return Promise.all([getAllStocks(), getAllTransactions()])
      .then(([stocks, txs]) => {
        setRows(calculatePortfolio(stocks, txs));
        setDaily(calculateDailyRealizedPnL(stocks, txs));
        setMonthly(calculateMonthlyRealizedPnL(stocks, txs));
      })
      .catch(() => {
        showAlert('Hata', 'Veriler yüklenemedi. Lütfen tekrar deneyin.');
      })
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const total = calculateTotalRealizedPnL(rows);
  const isProfit = total >= 0;

  const { todayPnL, weekPnL } = useMemo(() => {
    const now = new Date();
    const todayIso = toIsoDate(now);
    const mondayIso = mostRecentMondayIso(now);
    return {
      todayPnL: sumPnLInRange(daily, todayIso, todayIso),
      weekPnL: sumPnLInRange(daily, mondayIso, todayIso),
    };
  }, [daily]);

  const stockRowsByPnL = useMemo(
    () => [...rows].sort((a, b) => Math.abs(b.realizedPnL) - Math.abs(a.realizedPnL)),
    [rows]
  );
  const maxStockAbsPnL = useMemo(
    () => Math.max(1, ...stockRowsByPnL.map((r) => Math.abs(r.realizedPnL))),
    [stockRowsByPnL]
  );
  const maxMonthAbsPnL = useMemo(
    () => Math.max(1, ...monthly.map((m) => Math.abs(m.realizedPnL))),
    [monthly]
  );

  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.lg }]}
    >
      <View style={styles.heroCard}>
        <Text style={styles.totalLabel}>Toplam Gerçekleşen Kar/Zarar</Text>
        <View style={styles.totalRow}>
          <Ionicons
            name={isProfit ? 'trending-up' : 'trending-down'}
            size={22}
            color={isProfit ? colors.profit : colors.loss}
          />
          <Text style={[styles.totalValue, { color: isProfit ? colors.profit : colors.loss }]}>
            {total.toFixed(2)} TL
          </Text>
        </View>
      </View>

      <View style={styles.quickStatsRow}>
        <QuickStatCard label="Bugün" value={todayPnL} />
        <QuickStatCard label="Bu Hafta" value={weekPnL} />
      </View>

      {monthly.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Aylık Kar/Zarar</Text>
          {monthly.map((m) => (
            <BarListRow
              key={m.month}
              label={formatMonthLabel(m.month)}
              value={m.realizedPnL}
              maxAbs={maxMonthAbsPnL}
            />
          ))}
        </View>
      )}

      {stockRowsByPnL.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Hisse Bazında Kar/Zarar</Text>
          {stockRowsByPnL.map((r) => (
            <BarListRow
              key={r.stockId}
              label={r.symbol}
              sublabel={r.name}
              value={r.realizedPnL}
              maxAbs={maxStockAbsPnL}
              onPress={() => setSelectedStockId(r.stockId)}
            />
          ))}
        </View>
      )}

      {rows.length === 0 && (
        <View style={styles.emptyInline}>
          <Ionicons name="bar-chart-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>Henüz işlem yok.</Text>
        </View>
      )}

      <StockDetailModal
        visible={selectedStockId !== null}
        stockId={selectedStockId}
        onClose={() => setSelectedStockId(null)}
        onChanged={load}
      />
    </ScrollView>
  );
}

function QuickStatCard({ label, value }: { label: string; value: number }) {
  const isProfit = value >= 0;
  return (
    <View style={styles.quickStatCard}>
      <Text style={styles.quickStatLabel}>{label}</Text>
      <View style={styles.quickStatValueRow}>
        <Ionicons
          name={isProfit ? 'trending-up' : 'trending-down'}
          size={14}
          color={isProfit ? colors.profit : colors.loss}
        />
        <Text style={[styles.quickStatValue, { color: isProfit ? colors.profit : colors.loss }]}>
          {value.toFixed(2)} TL
        </Text>
      </View>
    </View>
  );
}

function BarListRow({
  label,
  sublabel,
  value,
  maxAbs,
  onPress,
}: {
  label: string;
  sublabel?: string;
  value: number;
  maxAbs: number;
  onPress?: () => void;
}) {
  const isProfit = value >= 0;
  const widthPct = Math.max(4, (Math.abs(value) / maxAbs) * 100);
  const barColor = isProfit ? colors.profit : colors.loss;
  const Container = onPress ? Pressable : View;
  return (
    <Container
      style={styles.barRow}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${label} detayını göster` : undefined}
    >
      <View style={styles.barLabelCol}>
        <Text style={styles.barLabel} numberOfLines={1}>
          {label}
        </Text>
        {sublabel && (
          <Text style={styles.barSublabel} numberOfLines={1}>
            {sublabel}
          </Text>
        )}
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${widthPct}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.barValue, { color: barColor }]} numberOfLines={1}>
        {isProfit ? '+' : ''}
        {value.toFixed(0)} TL
      </Text>
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
    </Container>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  emptyInline: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { color: colors.textPrimary, fontFamily: typography.fontMedium, fontSize: typography.body.fontSize },
  container: { padding: spacing.md, backgroundColor: colors.background },
  heroCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  totalLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontMedium,
    fontSize: typography.label.fontSize,
    marginBottom: spacing.xs,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  totalValue: { fontFamily: typography.fontBold, fontSize: typography.display.fontSize },
  quickStatsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  quickStatCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  quickStatLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontMedium,
    fontSize: typography.caption.fontSize,
    marginBottom: spacing.xs,
  },
  quickStatValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  quickStatValue: { fontFamily: typography.fontSemiBold, fontSize: typography.label.fontSize },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontSemiBold,
    fontSize: typography.body.fontSize,
    marginBottom: spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    minHeight: touchTarget.minSize,
  },
  barLabelCol: { width: 78 },
  barLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontMedium,
    fontSize: typography.label.fontSize,
  },
  barSublabel: {
    color: colors.textMuted,
    fontFamily: typography.fontRegular,
    fontSize: typography.caption.fontSize,
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius.pill },
  barValue: {
    width: 88,
    textAlign: 'right',
    fontFamily: typography.fontSemiBold,
    fontSize: typography.caption.fontSize,
  },
});
