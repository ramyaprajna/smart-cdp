import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface FieldDefinition {
  key: string;
  label: string;
  dataType: string;
  group: string;
}

interface StreamAnalyticsProps {
  streamId: string;
  schemaDefinition: {
    fields: FieldDefinition[];
  };
  analyticsConfig: {
    groupByFields: string[];
    aggregateFields: Array<{ key: string; aggregations: string[] }>;
    timeField: string | null;
    primaryMetric: string | null;
  };
}

// ─── Helper types ───────────────────────────────────────────────────────────

interface DistributionEntry {
  value: string;
  count: number;
}

interface TimeSeriesEntry {
  date: string;
  count: number;
}

interface NumericStats {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
}

type BarChartConfig = {
  type: 'bar';
  title: string;
  data: DistributionEntry[];
  dataKey: 'count';
  nameKey: 'value';
};

type LineChartConfig = {
  type: 'line';
  title: string;
  data: TimeSeriesEntry[];
  dataKey: 'count';
  nameKey: 'date';
};

type StatsConfig = {
  type: 'stats';
  title: string;
  stats: NumericStats;
};

type ChartConfig = BarChartConfig | LineChartConfig | StatsConfig;

// ─── Helper functions ────────────────────────────────────────────────────────

function computeDistribution(records: Record<string, unknown>[], field: string): DistributionEntry[] {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const raw = record[field];
    const value = raw == null ? '(empty)' : String(raw);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

function computeTimeSeries(records: Record<string, unknown>[], timeField: string): TimeSeriesEntry[] {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const raw = record[timeField];
    if (raw == null) continue;
    const date = new Date(String(raw));
    if (isNaN(date.getTime())) continue;
    // Group by day (YYYY-MM-DD)
    const day = date.toISOString().slice(0, 10);
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function computeNumericStats(records: Record<string, unknown>[], field: string): NumericStats {
  const values: number[] = [];
  for (const record of records) {
    const raw = record[field];
    const num = Number(raw);
    if (!isNaN(num)) values.push(num);
  }
  if (values.length === 0) {
    return { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
  }
  const sum = values.reduce((acc, v) => acc + v, 0);
  return {
    count: values.length,
    sum,
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BarChartComponent({ data, dataKey, nameKey }: Pick<BarChartConfig, 'data' | 'dataKey' | 'nameKey'>) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey={nameKey}
          tick={{ fontSize: 11 }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} fill={CHART_COLORS[0]}>
          {data.map((_entry, index) => (
            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineChartComponent({ data, dataKey, nameKey }: Pick<LineChartConfig, 'data' | 'dataKey' | 'nameKey'>) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey={nameKey}
          tick={{ fontSize: 11 }}
          angle={-35}
          textAnchor="end"
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={CHART_COLORS[0]}
          strokeWidth={2}
          dot={{ r: 3, fill: CHART_COLORS[0] }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function NumericStatsComponent({ stats, title }: { stats: NumericStats; title: string }) {
  const statItems = [
    { label: 'Count', value: stats.count.toLocaleString() },
    { label: 'Sum', value: stats.sum.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
    { label: 'Average', value: stats.avg.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
    { label: 'Min', value: stats.min.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
    { label: 'Max', value: stats.max.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-2">
      {statItems.map(({ label, value }) => (
        <div key={label} className="space-y-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default memo(function StreamAnalytics({
  streamId,
  schemaDefinition,
  analyticsConfig,
}: StreamAnalyticsProps) {
  const { data: recordsData, isLoading } = useQuery({
    queryKey: ['/api/lite-cdp/streams', streamId, 'records', { page: 1, pageSize: 1000 }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', pageSize: '1000' });
      const res = await apiRequest('GET', `/api/lite-cdp/streams/${streamId}/records?${params}`);
      return res.json();
    },
    enabled: !!streamId,
  });

  const charts = useMemo<ChartConfig[]>(() => {
    const records: Record<string, unknown>[] = recordsData?.records ?? [];
    if (records.length === 0) return [];

    const chartConfigs: ChartConfig[] = [];

    // Bar charts for each groupByField
    for (const groupField of analyticsConfig.groupByFields) {
      const fieldDef = schemaDefinition.fields.find((f) => f.key === groupField);
      if (!fieldDef) continue;
      chartConfigs.push({
        type: 'bar',
        title: `Distribution by ${fieldDef.label}`,
        data: computeDistribution(records, groupField),
        dataKey: 'count',
        nameKey: 'value',
      });
    }

    // Line chart for timeField
    if (analyticsConfig.timeField) {
      const timeSeries = computeTimeSeries(records, analyticsConfig.timeField);
      if (timeSeries.length > 0) {
        chartConfigs.push({
          type: 'line',
          title: 'Records Over Time',
          data: timeSeries,
          dataKey: 'count',
          nameKey: 'date',
        });
      }
    }

    // Stats card for primaryMetric (numeric fields only)
    if (analyticsConfig.primaryMetric) {
      const fieldDef = schemaDefinition.fields.find(
        (f) => f.key === analyticsConfig.primaryMetric
      );
      if (fieldDef && fieldDef.dataType === 'number') {
        const stats = computeNumericStats(records, analyticsConfig.primaryMetric);
        chartConfigs.push({
          type: 'stats',
          title: fieldDef.label,
          stats,
        });
      }
    }

    return chartConfigs;
  }, [recordsData, analyticsConfig, schemaDefinition]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-[300px] bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (charts.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="col-span-full">
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            No analytics configured for this stream
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {charts.map((chart, idx) => (
        <Card
          key={idx}
          className={chart.type === 'stats' ? 'col-span-full md:col-span-1' : undefined}
        >
          <CardHeader>
            <CardTitle className="text-sm font-medium">{chart.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {chart.type === 'bar' && (
              <BarChartComponent
                data={chart.data}
                dataKey={chart.dataKey}
                nameKey={chart.nameKey}
              />
            )}
            {chart.type === 'line' && (
              <LineChartComponent
                data={chart.data}
                dataKey={chart.dataKey}
                nameKey={chart.nameKey}
              />
            )}
            {chart.type === 'stats' && (
              <NumericStatsComponent stats={chart.stats} title={chart.title} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
});
