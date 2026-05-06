<template>
  <div class="trend-board">
    <div v-if="seriesList.length > 0" class="trend-overview-shell">
      <div class="trend-overview-copy">
        <span class="trend-kicker">环境趋势中枢</span>
        <h3>多指标运行画像</h3>
        <p>
          用更像驾驶舱的方式看最近 {{ rows.length }} 个时段的变化。
          主图聚焦当前指标，右侧保留全部指标切换和补传概览。
        </p>
        <div class="trend-overview-meta">
          <span class="trend-overview-chip">{{ rangeLabel || "当前时间范围" }}</span>
          <span class="trend-overview-chip">指标 {{ seriesList.length }} 项</span>
          <span class="trend-overview-chip">{{ granularityLabel }}</span>
        </div>
      </div>

      <div class="trend-overview-glance">
        <div class="trend-glance-card" :style="activeMetricStyle">
          <div class="trend-glance-label">当前主指标</div>
          <div class="trend-glance-value">{{ activeSeries?.metricName || "-" }}</div>
          <div class="trend-glance-sub">{{ activeSeries ? formatValue(activeSeries.latestValue, activeSeries.unitName) : "-" }}</div>
        </div>
        <div class="trend-glance-card trend-glance-card-muted">
          <div class="trend-glance-label">平均补传占比</div>
          <div class="trend-glance-value">{{ averageBackfillPercent }}%</div>
          <div class="trend-glance-sub">峰值 {{ maxBackfillPercent }}%</div>
        </div>
      </div>
    </div>

    <div v-if="seriesList.length > 0" class="trend-dashboard-grid">
      <section v-if="activeSeries" class="trend-main-panel" :style="activeMetricStyle">
        <div class="trend-main-head">
          <div class="trend-main-copy">
            <div class="trend-main-eyebrow">{{ activeSeries.metricName }}主图</div>
            <h3>{{ activeSeries.metricName }} {{ rangeLabel }} 趋势</h3>
            <p>{{ activeSeriesNarrative }}</p>
          </div>

          <div class="trend-main-highlight">
            <div class="trend-main-latest">{{ formatValue(activeSeries.latestValue, activeSeries.unitName) }}</div>
            <div class="trend-main-delta" :class="deltaClass(activeSeries.changeValue)">
              {{ formatTrendDelta(activeSeries.changeValue, activeSeries.unitName) }}
            </div>
          </div>
        </div>

        <div class="trend-chart-shell">
          <div class="trend-y-axis">
            <span>{{ formatAxisLabel(activeSeries.maxValue, activeSeries.unitName) }}</span>
            <span>{{ formatAxisLabel(activeSeries.midValue, activeSeries.unitName) }}</span>
            <span>{{ formatAxisLabel(activeSeries.minValue, activeSeries.unitName) }}</span>
          </div>

          <div class="trend-chart-stage">
            <svg viewBox="0 0 760 280" class="trend-chart" preserveAspectRatio="none">
              <defs>
                <linearGradient :id="activeSeries.areaGradientId" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" :stop-color="activeSeries.lineColor" stop-opacity="0.28" />
                  <stop offset="100%" :stop-color="activeSeries.lineColor" stop-opacity="0.03" />
                </linearGradient>
              </defs>

              <line
                v-for="line in gridLines"
                :key="line.y"
                class="trend-grid-line"
                :x1="0"
                :x2="760"
                :y1="line.y"
                :y2="line.y"
              />

              <path class="trend-area-path" :fill="`url(#${activeSeries.areaGradientId})`" :d="activeSeries.areaPath" />
              <path class="trend-line-path" :stroke="activeSeries.lineColor" :d="activeSeries.linePath" />

              <g v-for="bar in backfillBars" :key="bar.x">
                <rect
                  class="trend-backfill-bar"
                  :x="bar.x"
                  :y="bar.y"
                  :width="bar.width"
                  :height="bar.height"
                  rx="6"
                />
              </g>

              <circle
                v-for="point in activeSeries.points"
                :key="`${point.x}-${point.y}`"
                class="trend-point"
                :cx="point.x"
                :cy="point.y"
                r="4"
                :style="{ '--point-color': activeSeries.lineColor }"
              />
            </svg>

            <div class="trend-chart-legend">
              <span class="trend-legend-item">
                <i class="trend-legend-dot" :style="{ backgroundColor: activeSeries.lineColor }" />
                指标变化
              </span>
              <span class="trend-legend-item">
                <i class="trend-legend-bar" />
                补传占比
              </span>
            </div>
          </div>
        </div>

        <div class="trend-x-axis">
          <span>{{ startLabel }}</span>
          <span>{{ middleLabel }}</span>
          <span>{{ endLabel }}</span>
        </div>

        <div class="trend-footer-metrics">
          <div class="trend-footer-card">
            <span>最低点</span>
            <strong>{{ formatValue(activeSeries.minValue, activeSeries.unitName) }}</strong>
          </div>
          <div class="trend-footer-card">
            <span>均值</span>
            <strong>{{ formatValue(activeSeries.avgValue, activeSeries.unitName) }}</strong>
          </div>
          <div class="trend-footer-card">
            <span>峰值</span>
            <strong>{{ formatValue(activeSeries.maxValue, activeSeries.unitName) }}</strong>
          </div>
          <div class="trend-footer-card">
            <span>波动幅度</span>
            <strong>{{ formatValue(activeSeries.spreadValue, activeSeries.unitName) }}</strong>
          </div>
        </div>
      </section>

      <aside class="trend-side-panel">
        <div class="trend-side-head">
          <div>
            <div class="trend-side-title">指标切换</div>
            <div class="trend-side-desc">点选右侧卡片切换主图，不同指标按各自量程缩放。</div>
          </div>
        </div>

        <div class="trend-metric-stack">
          <button
            v-for="series in seriesList"
            :key="series.metricCode"
            type="button"
            class="trend-metric-card"
            :class="{ 'trend-metric-card-active': series.metricCode === activeMetricCode }"
            :style="metricStyle(series.metricCode)"
            @click="activeMetricCode = series.metricCode"
          >
            <div class="trend-metric-top">
              <div>
                <div class="trend-metric-name">{{ series.metricName }}</div>
                <div class="trend-metric-unit">{{ series.unitName || "无单位" }}</div>
              </div>
              <strong class="trend-metric-latest">{{ formatValue(series.latestValue, series.unitName) }}</strong>
            </div>

            <svg viewBox="0 0 180 68" class="trend-sparkline" preserveAspectRatio="none">
              <path class="trend-sparkline-area" :fill="series.sparkFillColor" :d="series.sparkAreaPath" />
              <path class="trend-sparkline-line" :stroke="series.lineColor" :d="series.sparkLinePath" />
            </svg>

            <div class="trend-metric-stats">
              <span>{{ describeDelta(series.changeValue) }}</span>
              <span>均值 {{ formatValue(series.avgValue, series.unitName) }}</span>
            </div>
          </button>
        </div>

        <div class="trend-backfill-panel">
          <div class="trend-side-title">补传热度</div>
          <div class="trend-backfill-strip">
            <span
              v-for="(item, index) in rows"
              :key="`${item.bucketAt}-${index}`"
              class="trend-backfill-block"
              :style="{ height: `${18 + clampRatio(item.backfillRatio) * 54}px` }"
            />
          </div>
          <div class="trend-backfill-note">柱高越高，表示该时段补传数据占比越高。</div>
        </div>
      </aside>
    </div>

    <div v-else class="empty-state">暂无可展示的趋势指标。</div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { formatMetricNumber } from "../lib/metrics";

const props = defineProps({
  columns: {
    type: Array,
    default: () => []
  },
  rows: {
    type: Array,
    default: () => []
  },
  granularity: {
    type: String,
    default: "hour"
  },
  rangeLabel: {
    type: String,
    default: ""
  }
});

const activeMetricCode = ref("");

const chartWidth = 760;
const sparkWidth = 180;
const sparkHeight = 68;
const chartTop = 18;
const chartBottom = 210;
const backfillBaseY = 246;
const backfillMaxHeight = 34;

const metricPalette = {
  temperature: {
    line: "#ca6b2c",
    fill: "rgba(202, 107, 44, 0.16)",
    soft: "#fff4e9",
    border: "rgba(202, 107, 44, 0.18)"
  },
  humidity: {
    line: "#1f8a70",
    fill: "rgba(31, 138, 112, 0.16)",
    soft: "#ebfaf5",
    border: "rgba(31, 138, 112, 0.18)"
  },
  ec: {
    line: "#7b8f2a",
    fill: "rgba(123, 143, 42, 0.16)",
    soft: "#f6fae7",
    border: "rgba(123, 143, 42, 0.18)"
  },
  ph: {
    line: "#9a4f68",
    fill: "rgba(154, 79, 104, 0.16)",
    soft: "#fff1f5",
    border: "rgba(154, 79, 104, 0.18)"
  },
  co2: {
    line: "#476d9f",
    fill: "rgba(71, 109, 159, 0.16)",
    soft: "#eef5ff",
    border: "rgba(71, 109, 159, 0.18)"
  },
  lux: {
    line: "#c28a17",
    fill: "rgba(194, 138, 23, 0.16)",
    soft: "#fff8ea",
    border: "rgba(194, 138, 23, 0.18)"
  }
};

const fallbackPalette = {
  line: "#2f6b42",
  fill: "rgba(47, 107, 66, 0.16)",
  soft: "#eef7f0",
  border: "rgba(47, 107, 66, 0.18)"
};

const seriesList = computed(() =>
  props.columns
    .map((column) => buildSeries(column, props.rows))
    .filter((item) => item.points.length > 0)
);

const activeSeries = computed(() => {
  if (seriesList.value.length === 0) {
    return null;
  }
  return seriesList.value.find((item) => item.metricCode === activeMetricCode.value) || seriesList.value[0];
});

const activeMetricStyle = computed(() => (activeSeries.value ? metricStyle(activeSeries.value.metricCode) : {}));

const backfillBars = computed(() => {
  const count = Math.max(props.rows.length, 1);
  const slotWidth = chartWidth / count;
  const barWidth = Math.max(Math.min(slotWidth * 0.55, 26), 10);
  return props.rows.map((item, index) => {
    const ratio = clampRatio(item.backfillRatio);
    const height = Number((ratio * backfillMaxHeight).toFixed(2));
    return {
      x: Number((index * slotWidth + (slotWidth - barWidth) / 2).toFixed(2)),
      y: Number((backfillBaseY - height).toFixed(2)),
      width: Number(barWidth.toFixed(2)),
      height
    };
  });
});

const gridLines = computed(() => [
  { y: chartTop },
  { y: chartTop + (chartBottom - chartTop) / 3 },
  { y: chartTop + ((chartBottom - chartTop) * 2) / 3 },
  { y: chartBottom }
]);

const startLabel = computed(() => formatBucketLabel(props.rows[0]?.bucketAt));
const middleLabel = computed(() => formatBucketLabel(props.rows[Math.floor(props.rows.length / 2)]?.bucketAt));
const endLabel = computed(() => formatBucketLabel(props.rows[props.rows.length - 1]?.bucketAt));

const averageBackfillPercent = computed(() => {
  if (!props.rows.length) {
    return 0;
  }
  const total = props.rows.reduce((sum, item) => sum + clampRatio(item.backfillRatio), 0);
  return Math.round((total / props.rows.length) * 100);
});

const maxBackfillPercent = computed(() =>
  Math.round(Math.max(0, ...props.rows.map((item) => clampRatio(item.backfillRatio))) * 100)
);

const granularityLabel = computed(() => (props.granularity === "day" ? "按日聚合" : "按小时聚合"));

const activeSeriesNarrative = computed(() => {
  if (!activeSeries.value) {
    return "暂无可展示的趋势数据。";
  }

  const series = activeSeries.value;
  const directionText = describeDelta(series.changeValue);
  return `${series.metricName}当前值为 ${formatValue(series.latestValue, series.unitName)}，${directionText}，波动幅度 ${formatValue(series.spreadValue, series.unitName)}，补传均值 ${averageBackfillPercent.value}%。`;
});

watch(
  () => seriesList.value.map((item) => item.metricCode).join(","),
  () => {
    if (!seriesList.value.some((item) => item.metricCode === activeMetricCode.value)) {
      activeMetricCode.value = seriesList.value[0]?.metricCode || "";
    }
  },
  { immediate: true }
);

function metricStyle(metricCode) {
  const palette = metricPalette[metricCode] || fallbackPalette;
  return {
    "--metric-line": palette.line,
    "--metric-fill": palette.fill,
    "--metric-soft": palette.soft,
    "--metric-border": palette.border
  };
}

function buildSeries(column, rows) {
  const palette = metricPalette[column.metricCode] || fallbackPalette;
  const values = rows.map((item) => {
    const rawValue = item.metricsByCode?.[column.metricCode];
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      return null;
    }
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) ? numeric : null;
  });

  const numericValues = values.filter((item) => item !== null);
  if (numericValues.length === 0) {
    return {
      metricCode: column.metricCode,
      metricName: column.metricName,
      unitName: column.unitName || "",
      latestValue: null,
      firstValue: null,
      minValue: null,
      maxValue: null,
      avgValue: null,
      midValue: null,
      spreadValue: null,
      changeValue: null,
      points: [],
      linePath: "",
      areaPath: "",
      sparkLinePath: "",
      sparkAreaPath: "",
      lineColor: palette.line,
      sparkFillColor: palette.fill,
      areaGradientId: `trend-grad-${column.metricCode}`
    };
  }

  const minValue = Math.min(...numericValues);
  const maxValue = Math.max(...numericValues);
  const avgValue = Number((numericValues.reduce((sum, item) => sum + item, 0) / numericValues.length).toFixed(2));
  const latestValue = [...numericValues].pop() ?? null;
  const firstValue = numericValues[0] ?? null;
  const spreadValue = Number((maxValue - minValue).toFixed(2));
  const changeValue =
    latestValue === null || firstValue === null ? null : Number((latestValue - firstValue).toFixed(2));
  const midValue = minValue === maxValue ? minValue : Number((((minValue + maxValue) / 2).toFixed(2)));

  const points = buildPoints(values, chartWidth, chartTop, chartBottom, minValue, maxValue);
  const sparkPoints = buildPoints(values, sparkWidth, 10, sparkHeight - 8, minValue, maxValue);

  return {
    metricCode: column.metricCode,
    metricName: column.metricName,
    unitName: column.unitName || "",
    latestValue,
    firstValue,
    minValue,
    maxValue,
    avgValue,
    midValue,
    spreadValue,
    changeValue,
    points,
    linePath: createLinePath(points),
    areaPath: createAreaPath(points, chartBottom),
    sparkLinePath: createLinePath(sparkPoints),
    sparkAreaPath: createAreaPath(sparkPoints, sparkHeight - 8),
    lineColor: palette.line,
    sparkFillColor: palette.fill,
    areaGradientId: `trend-grad-${column.metricCode}`
  };
}

function buildPoints(values, width, top, bottom, minValue, maxValue) {
  const stepX = values.length <= 1 ? width : width / (values.length - 1);
  const valueRange = maxValue - minValue || 1;
  return values
    .map((value, index) => {
      if (value === null) {
        return null;
      }
      const x = Number((index * stepX).toFixed(2));
      const ratio = maxValue === minValue ? 0.5 : (value - minValue) / valueRange;
      const y = Number((bottom - ratio * (bottom - top)).toFixed(2));
      return { x, y, value };
    })
    .filter(Boolean);
}

function createLinePath(points) {
  if (!points.length) {
    return "";
  }
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function createAreaPath(points, baseline) {
  if (!points.length) {
    return "";
  }
  const start = points[0];
  const end = points[points.length - 1];
  return `${createLinePath(points)} L ${end.x} ${baseline} L ${start.x} ${baseline} Z`;
}

function formatBucketLabel(bucketAt) {
  if (!bucketAt) {
    return "-";
  }
  if (props.granularity === "day") {
    return String(bucketAt).slice(5, 10);
  }
  if (String(bucketAt).length >= 16) {
    return String(bucketAt).slice(11, 16);
  }
  return String(bucketAt);
}

function formatValue(value, unitName) {
  const numericText = formatMetricNumber(value);
  return numericText === "-" ? "-" : `${numericText}${unitName || ""}`;
}

function formatAxisLabel(value, unitName) {
  const numericText = formatMetricNumber(value);
  return numericText === "-" ? "-" : `${numericText}${unitName || ""}`;
}

function formatTrendDelta(value, unitName) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return "较首点持平";
  }
  const prefix = numeric > 0 ? "+" : "";
  return `较首点 ${prefix}${formatMetricNumber(numeric)}${unitName || ""}`;
}

function describeDelta(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return "走势持平";
  }
  return numeric > 0 ? `较首点抬升 ${formatMetricNumber(numeric)}` : `较首点回落 ${formatMetricNumber(Math.abs(numeric))}`;
}

function deltaClass(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return "trend-main-delta-flat";
  }
  return numeric > 0 ? "trend-main-delta-up" : "trend-main-delta-down";
}

function clampRatio(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric < 0) {
    return 0;
  }
  if (numeric > 1) {
    return 1;
  }
  return numeric;
}
</script>

<style scoped>
.trend-board {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.trend-overview-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(260px, 0.8fr);
  gap: 16px;
  padding: 22px 24px;
  border-radius: 24px;
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.9), transparent 42%),
    linear-gradient(135deg, #f3f8f0 0%, #ebf5f7 100%);
  border: 1px solid rgba(49, 86, 60, 0.08);
}

.trend-overview-copy h3 {
  margin: 4px 0 10px;
  font-size: 28px;
  line-height: 1.1;
  color: #243929;
}

.trend-overview-copy p {
  margin: 0;
  max-width: 720px;
  color: #607164;
  line-height: 1.7;
}

.trend-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(33, 77, 48, 0.08);
  color: #2a5939;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.trend-overview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.trend-overview-chip {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(49, 86, 60, 0.08);
  color: #506456;
  font-size: 12px;
}

.trend-overview-glance {
  display: grid;
  gap: 12px;
}

.trend-glance-card {
  padding: 18px;
  border-radius: 20px;
  background: var(--metric-soft, #eef7f0);
  border: 1px solid var(--metric-border, rgba(47, 107, 66, 0.18));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
}

.trend-glance-card-muted {
  background: rgba(255, 255, 255, 0.74);
  border-color: rgba(49, 86, 60, 0.08);
}

.trend-glance-label {
  color: #6f8273;
  font-size: 12px;
}

.trend-glance-value {
  margin-top: 10px;
  font-size: 24px;
  font-weight: 700;
  color: #263a2c;
}

.trend-glance-sub {
  margin-top: 6px;
  color: #5f7265;
  font-size: 13px;
}

.trend-dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(300px, 0.9fr);
  gap: 18px;
}

.trend-main-panel {
  border-radius: 26px;
  padding: 22px;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.72), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, var(--metric-soft, #eef7f0) 100%);
  border: 1px solid var(--metric-border, rgba(47, 107, 66, 0.18));
  box-shadow: 0 20px 48px rgba(33, 54, 40, 0.08);
}

.trend-main-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.trend-main-copy {
  max-width: 620px;
}

.trend-main-eyebrow {
  color: var(--metric-line, #2f6b42);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.trend-main-copy h3 {
  margin: 8px 0 8px;
  font-size: 26px;
  color: #21362a;
}

.trend-main-copy p {
  margin: 0;
  color: #5f7265;
  line-height: 1.7;
}

.trend-main-highlight {
  min-width: 180px;
  text-align: right;
}

.trend-main-latest {
  font-size: 34px;
  line-height: 1;
  font-weight: 800;
  color: var(--metric-line, #2f6b42);
}

.trend-main-delta {
  margin-top: 10px;
  font-size: 13px;
  font-weight: 700;
}

.trend-main-delta-up {
  color: #176c58;
}

.trend-main-delta-down {
  color: #9a4f68;
}

.trend-main-delta-flat {
  color: #6a7d70;
}

.trend-chart-shell {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 14px;
  margin-top: 20px;
}

.trend-y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #6f8474;
  font-size: 12px;
  text-align: right;
  padding: 14px 0 42px;
}

.trend-chart-stage {
  position: relative;
}

.trend-chart {
  width: 100%;
  height: 292px;
  overflow: visible;
}

.trend-grid-line {
  stroke: rgba(69, 108, 79, 0.12);
  stroke-width: 1;
  stroke-dasharray: 4 7;
}

.trend-area-path {
  opacity: 1;
}

.trend-line-path {
  fill: none;
  stroke-width: 3.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.trend-point {
  fill: #fff;
  stroke: var(--point-color, #2f6b42);
  stroke-width: 2;
}

.trend-backfill-bar {
  fill: rgba(52, 79, 61, 0.12);
}

.trend-chart-legend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 6px;
  color: #607365;
  font-size: 12px;
}

.trend-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.trend-legend-dot,
.trend-legend-bar {
  display: inline-block;
  flex: 0 0 auto;
}

.trend-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.trend-legend-bar {
  width: 14px;
  height: 10px;
  border-radius: 4px;
  background: rgba(52, 79, 61, 0.18);
}

.trend-x-axis {
  margin-left: 86px;
  display: flex;
  justify-content: space-between;
  color: #6f8474;
  font-size: 12px;
  margin-top: 8px;
}

.trend-footer-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.trend-footer-card {
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(49, 86, 60, 0.08);
}

.trend-footer-card span {
  display: block;
  color: #718475;
  font-size: 12px;
}

.trend-footer-card strong {
  display: block;
  margin-top: 6px;
  color: #24392c;
  font-size: 18px;
}

.trend-side-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-radius: 26px;
  padding: 20px;
  background: linear-gradient(180deg, #f8fbf8 0%, #f1f6f2 100%);
  border: 1px solid rgba(49, 86, 60, 0.08);
}

.trend-side-title {
  font-size: 16px;
  font-weight: 700;
  color: #26392d;
}

.trend-side-desc {
  margin-top: 6px;
  color: #687c6d;
  font-size: 13px;
  line-height: 1.6;
}

.trend-metric-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trend-metric-card {
  border: 1px solid var(--metric-border, rgba(47, 107, 66, 0.12));
  background: linear-gradient(180deg, #ffffff 0%, var(--metric-soft, #f7fbf8) 100%);
  border-radius: 20px;
  padding: 16px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.trend-metric-card:hover,
.trend-metric-card-active {
  border-color: var(--metric-line, #2f6b42);
  box-shadow: 0 14px 26px rgba(33, 54, 40, 0.08);
  transform: translateY(-1px);
}

.trend-metric-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.trend-metric-name {
  font-size: 15px;
  font-weight: 700;
  color: #264331;
}

.trend-metric-unit {
  margin-top: 4px;
  color: #748674;
  font-size: 12px;
}

.trend-metric-latest {
  font-size: 18px;
  color: var(--metric-line, #2f6b42);
}

.trend-sparkline {
  width: 100%;
  height: 68px;
  margin: 12px 0 10px;
}

.trend-sparkline-line {
  fill: none;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.trend-sparkline-area {
  opacity: 1;
}

.trend-metric-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  color: #667c6d;
  font-size: 12px;
}

.trend-backfill-panel {
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.74);
  border: 1px solid rgba(49, 86, 60, 0.08);
}

.trend-backfill-strip {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 86px;
  margin-top: 14px;
}

.trend-backfill-block {
  flex: 1 1 auto;
  min-width: 8px;
  border-radius: 6px 6px 2px 2px;
  background: linear-gradient(180deg, rgba(58, 87, 67, 0.26) 0%, rgba(58, 87, 67, 0.08) 100%);
}

.trend-backfill-note {
  margin-top: 10px;
  color: #708373;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 1365px) {
  .trend-overview-shell,
  .trend-dashboard-grid,
  .trend-main-head,
  .trend-chart-shell,
  .trend-footer-metrics {
    grid-template-columns: 1fr;
  }

  .trend-main-highlight {
    text-align: left;
  }

  .trend-y-axis {
    display: none;
  }

  .trend-x-axis {
    margin-left: 0;
  }
}
</style>
