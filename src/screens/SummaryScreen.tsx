import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { getAllStocks } from '../db/stocksRepo';
import { getAllTransactions } from '../db/transactionsRepo';
import {
  calculateCumulativePnLOverTime,
  calculatePortfolio,
  calculateTotalRealizedPnL,
} from '../domain/calculations';
import { CumulativePnLPoint, PortfolioRow } from '../domain/types';

const screenWidth = Dimensions.get('window').width - 32;

export default function SummaryScreen() {
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [points, setPoints] = useState<CumulativePnLPoint[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getAllStocks(), getAllTransactions()]).then(([stocks, txs]) => {
        if (cancelled) return;
        setRows(calculatePortfolio(stocks, txs));
        setPoints(calculateCumulativePnLOverTime(stocks, txs));
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const total = calculateTotalRealizedPnL(rows);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.totalLabel}>Toplam Gerçekleşen Kar/Zarar</Text>
      <Text style={[styles.totalValue, total >= 0 ? styles.profit : styles.loss]}>
        {total.toFixed(2)} TL
      </Text>

      {rows.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Hisse Bazında Kar/Zarar</Text>
          <BarChart
            data={{
              labels: rows.map((r) => r.symbol),
              datasets: [{ data: rows.map((r) => r.realizedPnL) }],
            }}
            width={screenWidth}
            height={220}
            yAxisLabel=""
            yAxisSuffix=" TL"
            chartConfig={chartConfig}
            fromZero
            style={styles.chart}
          />
        </>
      )}

      {points.length > 1 && (
        <>
          <Text style={styles.sectionTitle}>Zaman İçinde Kümülatif Kar/Zarar</Text>
          <LineChart
            data={{
              labels: points.map((p) => p.date.slice(5)),
              datasets: [{ data: points.map((p) => p.cumulativePnL) }],
            }}
            width={screenWidth}
            height={220}
            yAxisLabel=""
            yAxisSuffix=" TL"
            chartConfig={chartConfig}
            style={styles.chart}
          />
        </>
      )}

      {rows.length === 0 && <Text>Henüz işlem yok.</Text>}
    </ScrollView>
  );
}

const chartConfig = {
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
  decimalPlaces: 0,
};

const styles = StyleSheet.create({
  container: { padding: 16 },
  totalLabel: { fontSize: 14, color: '#666' },
  totalValue: { fontSize: 28, fontWeight: 'bold', marginBottom: 16 },
  sectionTitle: { fontWeight: '600', marginTop: 16, marginBottom: 8 },
  chart: { borderRadius: 8 },
  profit: { color: '#16a34a' },
  loss: { color: '#dc2626' },
});
