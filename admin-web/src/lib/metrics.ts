import { apiRequest } from "./api";
import { enumLabel } from "./enum-display";

export interface MetricOption {
  metricCode: string;
  metricName: string;
  unitName: string;
  sortOrder: number;
  enabled: boolean;
}

export interface MetricSummary {
  metricCode: string;
  metricName: string;
  unitName: string;
  avgValue: unknown;
  sortOrder: number;
}

type MetricLike = Record<string, unknown> | null | undefined;

export const DEFAULT_METRIC_OPTIONS: MetricOption[] = [
  { metricCode: "temperature", metricName: "温度", unitName: "℃", sortOrder: 10, enabled: true },
  { metricCode: "humidity", metricName: "湿度", unitName: "%", sortOrder: 20, enabled: true },
  { metricCode: "ec", metricName: "电导率", unitName: "mS/cm", sortOrder: 30, enabled: true },
  { metricCode: "ph", metricName: "酸碱度", unitName: "pH", sortOrder: 40, enabled: true }
];

function normalizeMetricOption(item: MetricLike, index = 0): MetricOption | null {
  const metricCode = String(item?.metricCode || item?.metric_code || "").trim();
  if (!metricCode) {
    return null;
  }

  return {
    metricCode,
    metricName: String(item?.metricName || item?.metric_name || enumLabel("sensorType", metricCode)).trim(),
    unitName: String(item?.unitName || item?.unit_name || "").trim(),
    sortOrder: Number(item?.sortOrder ?? item?.sort_order ?? index + 1) || index + 1,
    enabled: item?.enabled === undefined ? true : Boolean(item.enabled)
  };
}

export function buildMetricOptions(rows: MetricLike[] = []): MetricOption[] {
  return rows
    .map((item, index) => normalizeMetricOption(item, index))
    .filter((item): item is MetricOption => Boolean(item))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.metricCode.localeCompare(right.metricCode));
}

export async function loadMetricOptions(): Promise<MetricOption[]> {
  try {
    const rows = await apiRequest<MetricLike[]>("/api/v1/metrics?enabled=true");
    const options = buildMetricOptions(rows).filter((item) => item.enabled);
    return options.length > 0 ? options : DEFAULT_METRIC_OPTIONS;
  } catch {
    return DEFAULT_METRIC_OPTIONS;
  }
}

export function findMetricOption(options: MetricOption[], metricCode?: string | null): MetricOption | null {
  if (!metricCode) {
    return null;
  }
  return options.find((item) => item.metricCode === metricCode) || null;
}

export function metricLabel(options: MetricOption[], metricCode?: string | null): string {
  if (!metricCode) {
    return "-";
  }
  return findMetricOption(options, metricCode)?.metricName || enumLabel("sensorType", metricCode);
}

export function metricUnit(options: MetricOption[], metricCode?: string | null): string {
  return findMetricOption(options, metricCode)?.unitName || "";
}

export function formatMetricNumber(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Number(numeric.toFixed(2))}` : "-";
}

export function normalizeMetricSummary(item: MetricLike, options: MetricOption[] = [], index = 0): MetricSummary | null {
  const metricCode = String(item?.metricCode || item?.metric_code || "").trim();
  if (!metricCode) {
    return null;
  }

  return {
    metricCode,
    metricName: String(item?.metricName || item?.metric_name || metricLabel(options, metricCode)).trim(),
    unitName: String(item?.unitName || item?.unit_name || metricUnit(options, metricCode)).trim(),
    avgValue: item?.avgValue ?? item?.avg_value ?? null,
    sortOrder: Number(item?.sortOrder ?? item?.sort_order ?? index + 1) || index + 1
  };
}

export function buildMetricSummaryList(metricsJson: MetricLike, options: MetricOption[] = []): MetricSummary[] {
  const primaryMetrics = Array.isArray(metricsJson?.primaryMetrics) ? metricsJson.primaryMetrics : [];
  if (primaryMetrics.length > 0) {
    return primaryMetrics
      .map((item, index) => normalizeMetricSummary(item as MetricLike, options, index))
      .filter((item): item is MetricSummary => Boolean(item));
  }

  const metricSummaries = Array.isArray(metricsJson?.metricSummaries) ? metricsJson.metricSummaries : [];
  if (metricSummaries.length > 0) {
    return metricSummaries
      .map((item, index) => normalizeMetricSummary(item as MetricLike, options, index))
      .filter((item): item is MetricSummary => Boolean(item))
      .slice(0, 4);
  }

  const fallback: MetricSummary[] = [];
  if (metricsJson?.avgTemperature !== undefined && metricsJson?.avgTemperature !== null) {
    fallback.push({
      metricCode: "temperature",
      metricName: metricLabel(options, "temperature"),
      unitName: metricUnit(options, "temperature") || "℃",
      avgValue: metricsJson.avgTemperature,
      sortOrder: 10
    });
  }
  if (metricsJson?.avgHumidity !== undefined && metricsJson?.avgHumidity !== null) {
    fallback.push({
      metricCode: "humidity",
      metricName: metricLabel(options, "humidity"),
      unitName: metricUnit(options, "humidity") || "%",
      avgValue: metricsJson.avgHumidity,
      sortOrder: 20
    });
  }
  return fallback;
}

export function metricDisplayValue(item: Pick<MetricSummary, "avgValue" | "unitName"> | null | undefined): string {
  return `${formatMetricNumber(item?.avgValue)}${item?.unitName || ""}`;
}
