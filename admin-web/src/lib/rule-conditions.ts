type MetricResolver = (metricCode?: string | null) => string;

export interface SecondaryMetricCondition {
  metric: string;
  operator: string;
  threshold: number;
  stableSeconds: number;
  summary?: string;
}

export interface ValueGuardCondition {
  enabled?: boolean;
  minValid?: number | null;
  maxValid?: number | null;
  minRecentPositiveCount?: number;
  recentPositiveWindowSeconds?: number;
  recentPositiveThreshold?: number;
  invalidSampleCount?: number;
  invalidWindowSeconds?: number;
  createAlert?: boolean;
  alertSeverity?: string;
}

type ConditionLike = Record<string, any> | null | undefined;

function toNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function aggregationLabel(value?: string | null): string {
  if (value === "avg") {
    return "平均值";
  }
  if (value === "max") {
    return "最大值";
  }
  if (value === "min") {
    return "最小值";
  }
  return "最新值";
}

export function normalizeSecondaryMetricCondition(
  raw: ConditionLike,
  fallbackStableSeconds = 0
): SecondaryMetricCondition | null {
  if (!raw || raw.enabled === false) {
    return null;
  }
  const metric = String(raw.metric || "").trim();
  const operator = String(raw.operator || "").trim();
  const threshold = toNumberOrNull(raw.threshold);
  if (!metric || !operator || threshold === null) {
    return null;
  }
  return {
    metric,
    operator,
    threshold,
    stableSeconds: Math.max(0, Number(raw.stableSeconds ?? fallbackStableSeconds ?? 0) || 0),
    summary: String(raw.summary || "").trim()
  };
}

export function normalizeValueGuardCondition(
  raw: ConditionLike,
  fallbackStableSeconds = 0
): ValueGuardCondition | null {
  if (!raw || raw.enabled === false) {
    return null;
  }

  const guard: ValueGuardCondition = {
    enabled: true,
    minValid: toNumberOrNull(raw.minValid),
    maxValid: toNumberOrNull(raw.maxValid),
    minRecentPositiveCount: Math.max(0, Number(raw.minRecentPositiveCount || 0) || 0),
    recentPositiveWindowSeconds: Math.max(0, Number(raw.recentPositiveWindowSeconds ?? fallbackStableSeconds ?? 0) || 0),
    recentPositiveThreshold: toNumberOrNull(raw.recentPositiveThreshold) ?? 0,
    invalidSampleCount: Math.max(0, Number(raw.invalidSampleCount || 0) || 0),
    invalidWindowSeconds: Math.max(0, Number(raw.invalidWindowSeconds ?? fallbackStableSeconds ?? 0) || 0),
    createAlert: raw.createAlert !== false,
    alertSeverity: String(raw.alertSeverity || "high").trim() || "high"
  };

  const hasRange = guard.minValid !== null || guard.maxValid !== null;
  const hasPositiveGuard = Number(guard.minRecentPositiveCount || 0) > 0;
  const hasInvalidGuard = Number(guard.invalidSampleCount || 0) > 0;
  if (!hasRange && !hasPositiveGuard && !hasInvalidGuard) {
    return null;
  }
  return guard;
}

export function buildMetricConditionText(
  condition: ConditionLike,
  resolveMetricLabel: MetricResolver
): string {
  if (!condition?.metric || !condition?.operator || condition?.threshold === undefined || condition?.threshold === null) {
    return "-";
  }

  const stableSeconds = Number(condition.stableSeconds || 0);
  const stablePart = stableSeconds > 0 ? ` 持续 ${stableSeconds} 秒` : "";
  return `${resolveMetricLabel(condition.metric)} ${condition.operator} ${condition.threshold}${stablePart}`;
}

export function buildValueGuardSummary(guard: ConditionLike): string {
  const normalized = normalizeValueGuardCondition(guard);
  if (!normalized) {
    return "-";
  }

  const segments: string[] = [];
  if (normalized.minValid !== null || normalized.maxValid !== null) {
    const rangeParts: string[] = [];
    if (normalized.minValid !== null) {
      rangeParts.push(`>= ${normalized.minValid}`);
    }
    if (normalized.maxValid !== null) {
      rangeParts.push(`<= ${normalized.maxValid}`);
    }
    segments.push(`有效值 ${rangeParts.join(" 且 ")}`);
  }

  if (Number(normalized.minRecentPositiveCount || 0) > 0) {
    segments.push(
      `最近 ${normalized.recentPositiveWindowSeconds || 0} 秒内至少 ${normalized.minRecentPositiveCount} 个 > ${normalized.recentPositiveThreshold || 0} 的样本`
    );
  }

  if (Number(normalized.invalidSampleCount || 0) > 0) {
    const alertText = normalized.createAlert ? `，并创建${normalized.alertSeverity || "high"}级告警` : "";
    segments.push(
      `最近 ${normalized.invalidWindowSeconds || 0} 秒内异常样本达到 ${normalized.invalidSampleCount} 个时拦截自动控制${alertText}`
    );
  } else if (normalized.createAlert) {
    segments.push(`命中保护后创建${normalized.alertSeverity || "high"}级告警`);
  }

  return segments.join("；");
}

export function buildRuleConditionSummary(
  condition: ConditionLike,
  ruleType: string | null | undefined,
  resolveMetricLabel: MetricResolver
): string {
  if (!condition) {
    return "-";
  }

  const metricText = resolveMetricLabel(condition.metric);
  if (ruleType === "trend") {
    const directionText = condition.direction === "drop" ? "下降" : "上升";
    return `${metricText} 在 ${condition.windowMinutes || 60} 分钟内${directionText}超过 ${condition.changeThreshold || 0}，持续 ${condition.stableSeconds || 0} 秒`;
  }

  if (ruleType === "anomaly") {
    const methodText = condition.method === "zscore" ? "标准分数" : condition.method === "spike" ? "瞬时尖峰" : "偏差阈值";
    return `${metricText} 使用 ${methodText} 检测，阈值 ${condition.deviationThreshold || 0}，窗口 ${condition.windowMinutes || 60} 分钟`;
  }

  const stablePart = Number.isFinite(Number(condition.stableSeconds)) ? ` 持续 ${condition.stableSeconds} 秒` : "";
  const aggregationPart = condition.aggregation && condition.aggregation !== "latest" ? `（${aggregationLabel(condition.aggregation)}）` : "";
  const segments = [`${metricText} ${condition.operator || "<"} ${condition.threshold ?? "-"}${stablePart}${aggregationPart}`];

  const secondaryCondition = normalizeSecondaryMetricCondition(condition.secondaryCondition, Number(condition.stableSeconds || 0));
  if (secondaryCondition) {
    segments.push(`联动条件：${buildMetricConditionText(secondaryCondition, resolveMetricLabel)}`);
  }

  const guardText = buildValueGuardSummary(condition.valueGuard);
  if (guardText !== "-") {
    segments.push(`保护：${guardText}`);
  }

  return segments.join("；");
}
