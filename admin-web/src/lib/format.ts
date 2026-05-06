export const DISPLAY_TIMEZONE = "Asia/Shanghai";
export const DISPLAY_TIMEZONE_LABEL = "北京时间";

export type FormattableValue = string | number | Date | null | undefined;

export function formatDateTime(value: FormattableValue): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: DISPLAY_TIMEZONE
  }).format(date);
}

export function formatNumber(value: string | number | null | undefined, digits = 2): string {
  if (value === undefined || value === null || value === "") {
    return "-";
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value);
  }

  return number.toFixed(digits);
}

export function formatJson(value: unknown): string {
  if (!value) {
    return "-";
  }

  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  return JSON.stringify(value, null, 2);
}

export function joinList(values: string[] | null | undefined = []): string {
  if (!Array.isArray(values) || values.length === 0) {
    return "-";
  }

  return values.join("、");
}
