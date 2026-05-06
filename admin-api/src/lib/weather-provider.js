const http = require("http");
const https = require("https");
const { pinyin } = require("pinyin-pro");
const { loadConfigGroup } = require("./system-config");

const WEATHER_PROVIDER_LABELS = {
  open_meteo: "Open-Meteo"
};

const DEFAULT_WEATHER_CONFIG = {
  enabled: true,
  providerType: "open_meteo",
  timeoutMs: 8000,
  currentCacheTtlSeconds: 900,
  staleCacheTtlSeconds: 6 * 60 * 60,
  geocodingEnabled: true,
  geocodingLanguage: "zh",
  timezone: "Asia/Shanghai",
  temperatureUnit: "celsius",
  windSpeedUnit: "kmh",
  precipitationUnit: "mm"
};

const currentWeatherCache = new Map();
const geocodingCache = new Map();

async function getWeatherProviderConfig(options = null) {
  const rawConfig = await loadConfigGroup("weather_provider", options);
  return {
    enabled: normalizeBoolean(rawConfig.enabled, DEFAULT_WEATHER_CONFIG.enabled),
    providerType: normalizeProviderType(rawConfig.provider_type || DEFAULT_WEATHER_CONFIG.providerType),
    timeoutMs: normalizeInteger(rawConfig.timeout_ms, DEFAULT_WEATHER_CONFIG.timeoutMs),
    currentCacheTtlSeconds: normalizeInteger(rawConfig.current_cache_ttl_seconds, DEFAULT_WEATHER_CONFIG.currentCacheTtlSeconds),
    staleCacheTtlSeconds: normalizeInteger(rawConfig.stale_cache_ttl_seconds, DEFAULT_WEATHER_CONFIG.staleCacheTtlSeconds),
    geocodingEnabled: normalizeBoolean(rawConfig.geocoding_enabled, DEFAULT_WEATHER_CONFIG.geocodingEnabled),
    geocodingLanguage: normalizeString(rawConfig.geocoding_language, DEFAULT_WEATHER_CONFIG.geocodingLanguage),
    timezone: normalizeString(rawConfig.timezone, DEFAULT_WEATHER_CONFIG.timezone),
    temperatureUnit: normalizeTemperatureUnit(rawConfig.temperature_unit || DEFAULT_WEATHER_CONFIG.temperatureUnit),
    windSpeedUnit: normalizeWindSpeedUnit(rawConfig.wind_speed_unit || DEFAULT_WEATHER_CONFIG.windSpeedUnit),
    precipitationUnit: normalizePrecipitationUnit(rawConfig.precipitation_unit || DEFAULT_WEATHER_CONFIG.precipitationUnit)
  };
}

async function resolveAreaWeather(area, options = null) {
  const normalizedArea = normalizeArea(area);
  const providerConfig = await getWeatherProviderConfig(options);

  if (!providerConfig.enabled) {
    return {
      status: "disabled",
      summary: "天气服务已关闭，可在系统设置中重新启用。",
      weatherEnabled: false,
      providerType: providerConfig.providerType,
      providerLabel: providerLabel(providerConfig.providerType),
      currentDateSource: providerConfig.timezone,
      area: normalizedArea,
      current: null,
      location: null
    };
  }

  if (!normalizedArea) {
    return {
      status: "no_area",
      summary: "当前账号还没有可用区域，暂时无法展示天气上下文。",
      weatherEnabled: false,
      providerType: providerConfig.providerType,
      providerLabel: providerLabel(providerConfig.providerType),
      currentDateSource: providerConfig.timezone,
      area: null,
      current: null,
      location: null
    };
  }

  const location = await resolveAreaLocation(normalizedArea, providerConfig);
  if (location.status !== "resolved") {
    return {
      status: location.status,
      summary: location.summary,
      weatherEnabled: false,
      providerType: providerConfig.providerType,
      providerLabel: providerLabel(providerConfig.providerType),
      currentDateSource: providerConfig.timezone,
      area: normalizedArea,
      current: null,
      location: location.location || null
    };
  }

  const weatherResult = await loadCurrentWeather(location.location, providerConfig);
  if (!weatherResult.ok) {
    const fallbackSummary = weatherResult.current
      ? `${buildWeatherSummary(weatherResult.current)}（${weatherResult.status === "stale" ? "已切换为缓存数据" : "实时数据暂不可用"}）`
      : weatherResult.summary;
    return {
      status: weatherResult.status,
      summary: fallbackSummary,
      weatherEnabled: true,
      providerType: providerConfig.providerType,
      providerLabel: providerLabel(providerConfig.providerType),
      currentDateSource: providerConfig.timezone,
      area: normalizedArea,
      current: weatherResult.current || null,
      location: location.location
    };
  }

  return {
    status: weatherResult.status,
    summary: buildWeatherSummary(weatherResult.current),
    weatherEnabled: true,
    providerType: providerConfig.providerType,
    providerLabel: providerLabel(providerConfig.providerType),
    currentDateSource: providerConfig.timezone,
    area: normalizedArea,
    current: weatherResult.current,
    location: location.location
  };
}

async function resolveAreaLocation(area, providerConfig) {
  if (area.latitude != null && area.longitude != null) {
    return {
      status: "resolved",
      summary: "",
      location: {
        source: "area_coordinates",
        latitude: area.latitude,
        longitude: area.longitude,
        name: area.weatherLocationName || area.areaName || null,
        providerRef: area.weatherProviderRef || null
      }
    };
  }

  const providerCoordinates = parseCoordinatePair(area.weatherProviderRef);
  if (providerCoordinates) {
    return {
      status: "resolved",
      summary: "",
      location: {
        source: "provider_ref_coordinates",
        latitude: providerCoordinates.latitude,
        longitude: providerCoordinates.longitude,
        name: area.weatherLocationName || area.areaName || null,
        providerRef: area.weatherProviderRef
      }
    };
  }

  const lookupQuery = normalizeString(area.weatherProviderRef, "") || normalizeString(area.weatherLocationName, "");
  if (!lookupQuery) {
    return {
      status: "not_configured",
      summary: "请先在区域管理中填写天气定位名称或经纬度，再接入天气服务。",
      location: null
    };
  }

  if (!providerConfig.geocodingEnabled) {
    return {
      status: "not_configured",
      summary: "天气服务未启用地名解析，请直接填写区域经纬度。",
      location: null
    };
  }

  const geocodingResult = await geocodeLocation(lookupQuery, providerConfig);
  if (!geocodingResult.ok) {
    return {
      status: geocodingResult.status,
      summary: geocodingResult.summary,
      location: geocodingResult.location || null
    };
  }

  return {
    status: "resolved",
    summary: "",
    location: {
      source: "geocoded_name",
      latitude: geocodingResult.location.latitude,
      longitude: geocodingResult.location.longitude,
      name: geocodingResult.location.name,
      providerRef: geocodingResult.location.providerRef
    }
  };
}

async function geocodeLocation(queryText, providerConfig) {
  const cacheKey = `${providerConfig.providerType}:${providerConfig.geocodingLanguage}:${queryText}`;
  const cached = readCache(geocodingCache, cacheKey);
  if (cached) {
    return {
      ok: true,
      location: cached.value,
      status: "resolved",
      summary: ""
    };
  }

  try {
    const candidates = buildGeocodingCandidates(queryText);
    let first = null;
    for (const candidate of candidates) {
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.searchParams.set("name", candidate);
      url.searchParams.set("count", "1");
      url.searchParams.set("language", providerConfig.geocodingLanguage);
      url.searchParams.set("format", "json");

      const payload = await fetchJson(url.toString(), providerConfig.timeoutMs);
      first = Array.isArray(payload.results) ? payload.results[0] : null;
      if (first) {
        break;
      }
    }

    if (!first) {
      return {
        ok: false,
        status: "location_unresolved",
        summary: "当前区域天气定位名称未能解析到有效位置，请改成城市/区县名称或直接填写经纬度。",
        location: null
      };
    }

    const resolved = {
      latitude: normalizeFloat(first.latitude),
      longitude: normalizeFloat(first.longitude),
      name: buildResolvedLocationName(first),
      providerRef: String(first.id || "").trim() || null,
      countryCode: String(first.country_code || "").trim() || null,
      admin1: String(first.admin1 || "").trim() || null,
      admin2: String(first.admin2 || "").trim() || null
    };

    if (resolved.latitude == null || resolved.longitude == null) {
      return {
        ok: false,
        status: "location_unresolved",
        summary: "天气定位已解析但缺少有效经纬度，请直接填写区域坐标。",
        location: null
      };
    }

    writeCache(
      geocodingCache,
      cacheKey,
      resolved,
      providerConfig.currentCacheTtlSeconds,
      providerConfig.staleCacheTtlSeconds
    );

    return {
      ok: true,
      location: resolved,
      status: "resolved",
      summary: ""
    };
  } catch (error) {
    return {
      ok: false,
      status: "provider_error",
      summary: `天气定位解析失败：${sanitizeErrorMessage(error)}`,
      location: null
    };
  }
}

async function loadCurrentWeather(location, providerConfig) {
  const cacheKey = [
    providerConfig.providerType,
    location.latitude,
    location.longitude,
    providerConfig.temperatureUnit,
    providerConfig.windSpeedUnit,
    providerConfig.precipitationUnit,
    providerConfig.timezone
  ].join(":");

  const cached = readCache(currentWeatherCache, cacheKey);
  if (cached && !cached.isStale) {
    return {
      ok: true,
      status: "live",
      current: cached.value
    };
  }

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(location.latitude));
    url.searchParams.set("longitude", String(location.longitude));
    url.searchParams.set(
      "current",
      [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "is_day",
        "precipitation",
        "weather_code",
        "cloud_cover",
        "surface_pressure",
        "wind_speed_10m",
        "wind_direction_10m"
      ].join(",")
    );
    url.searchParams.set("timezone", providerConfig.timezone);
    url.searchParams.set("temperature_unit", providerConfig.temperatureUnit);
    url.searchParams.set("wind_speed_unit", providerConfig.windSpeedUnit);
    url.searchParams.set("precipitation_unit", providerConfig.precipitationUnit);

    const payload = await fetchJson(url.toString(), providerConfig.timeoutMs);
    const current = normalizeCurrentWeather(payload.current, {
      temperatureUnit: payload.current_units?.temperature_2m || unitLabelForTemperature(providerConfig.temperatureUnit),
      humidityUnit: payload.current_units?.relative_humidity_2m || "%",
      apparentTemperatureUnit: payload.current_units?.apparent_temperature || unitLabelForTemperature(providerConfig.temperatureUnit),
      precipitationUnit: payload.current_units?.precipitation || unitLabelForPrecipitation(providerConfig.precipitationUnit),
      windSpeedUnit: payload.current_units?.wind_speed_10m || unitLabelForWindSpeed(providerConfig.windSpeedUnit),
      pressureUnit: payload.current_units?.surface_pressure || "hPa"
    });

    writeCache(
      currentWeatherCache,
      cacheKey,
      current,
      providerConfig.currentCacheTtlSeconds,
      providerConfig.staleCacheTtlSeconds
    );

    return {
      ok: true,
      status: "live",
      current
    };
  } catch (error) {
    if (cached?.value) {
      return {
        ok: false,
        status: "stale",
        summary: `天气服务暂时不可用，已展示最近一次缓存数据：${sanitizeErrorMessage(error)}`,
        current: cached.value
      };
    }
    return {
      ok: false,
      status: "provider_error",
      summary: `天气服务调用失败：${sanitizeErrorMessage(error)}`,
      current: null
    };
  }
}

async function fetchJson(url, timeoutMs) {
  const targetUrl = new URL(url);
  const transport = targetUrl.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      targetUrl,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        timeout: timeoutMs
      },
      (response) => {
        let responseText = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseText += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`HTTP ${response.statusCode} ${truncateText(responseText, 120)}`));
            return;
          }
          try {
            resolve(responseText ? JSON.parse(responseText) : {});
          } catch (error) {
            reject(new Error(`天气服务返回了无法解析的 JSON：${sanitizeErrorMessage(error)}`));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`请求超时，超过 ${timeoutMs}ms`));
    });
    request.on("error", (error) => {
      reject(error);
    });
    request.end();
  });
}

function normalizeCurrentWeather(current, units) {
  const isDay = Number(current?.is_day) === 1;
  const weatherCode = normalizeInteger(current?.weather_code);
  return {
    observedAt: current?.time || null,
    temperature: normalizeFloat(current?.temperature_2m),
    temperatureUnit: units.temperatureUnit,
    relativeHumidity: normalizeFloat(current?.relative_humidity_2m),
    humidityUnit: units.humidityUnit,
    apparentTemperature: normalizeFloat(current?.apparent_temperature),
    apparentTemperatureUnit: units.apparentTemperatureUnit,
    precipitation: normalizeFloat(current?.precipitation),
    precipitationUnit: units.precipitationUnit,
    cloudCover: normalizeFloat(current?.cloud_cover),
    surfacePressure: normalizeFloat(current?.surface_pressure),
    pressureUnit: units.pressureUnit,
    windSpeed: normalizeFloat(current?.wind_speed_10m),
    windSpeedUnit: units.windSpeedUnit,
    windDirection: normalizeFloat(current?.wind_direction_10m),
    weatherCode,
    weatherLabel: weatherCodeLabel(weatherCode, isDay),
    isDay
  };
}

function buildWeatherSummary(current) {
  const segments = [];
  if (current.weatherLabel) {
    segments.push(current.weatherLabel);
  }
  if (current.temperature != null) {
    segments.push(`${formatDisplayNumber(current.temperature, 1)}${current.temperatureUnit}`);
  }
  if (current.relativeHumidity != null) {
    segments.push(`湿度 ${formatDisplayNumber(current.relativeHumidity, 0)}${current.humidityUnit}`);
  }
  if (current.windSpeed != null) {
    segments.push(`风速 ${formatDisplayNumber(current.windSpeed, 1)} ${current.windSpeedUnit}`);
  }
  return segments.join(" · ") || "已接入实时天气数据";
}

function normalizeArea(area) {
  if (!area) {
    return null;
  }
  return {
    id: area.id,
    areaCode: area.areaCode || null,
    areaName: area.areaName || null,
    weatherLocationName: area.weatherLocationName || null,
    weatherProviderRef: area.weatherProviderRef || null,
    latitude: area.latitude == null ? null : normalizeFloat(area.latitude),
    longitude: area.longitude == null ? null : normalizeFloat(area.longitude),
    updatedAt: area.updatedAt || null
  };
}

function parseCoordinatePair(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }
  return {
    latitude: Number.parseFloat(match[1]),
    longitude: Number.parseFloat(match[2])
  };
}

function buildGeocodingCandidates(queryText) {
  const base = normalizeString(queryText, "");
  const values = [];
  const push = (value) => {
    const normalized = normalizeString(value, "");
    if (!normalized || values.includes(normalized)) {
      return;
    }
    values.push(normalized);
  };

  push(base);
  push(base.replace(/\s+/g, ""));
  push(base.replace(/^中国/, ""));

  const districtLike = base.match(/([^省市自治区特别行政区]+(?:区|县|旗|市))$/);
  const cityDistrictLike = base.match(/([^省自治区]+市[^区县旗]+(?:区|县|旗))/);
  if (cityDistrictLike) {
    push(cityDistrictLike[1]);
  }

  const cityLike = base.match(/([^省自治区]+市)/);
  if (cityLike) {
    push(cityLike[1]);
  }

  if (districtLike) {
    push(districtLike[1]);
  }

  if (base.includes("北京市")) {
    push(base.replace("北京市", "北京"));
  }

  const prioritizedVariants = [
    cityDistrictLike?.[1],
    cityLike?.[1],
    base,
    districtLike?.[1]
  ].filter(Boolean);

  for (const value of prioritizedVariants) {
    const stripped = stripAdministrativeSuffix(value);
    if (stripped && stripped !== value) {
      push(stripped);
    }
  }

  for (const value of prioritizedVariants) {
    const transliterated = transliterateLocationName(value);
    if (transliterated) {
      push(transliterated.spaced);
      push(transliterated.compact);
    }

    const stripped = stripAdministrativeSuffix(value);
    if (stripped && stripped !== value) {
      const strippedTransliteration = transliterateLocationName(stripped);
      if (strippedTransliteration) {
        push(strippedTransliteration.spaced);
        push(strippedTransliteration.compact);
      }
    }
  }

  return values;
}

function stripAdministrativeSuffix(value) {
  const normalized = normalizeString(value, "");
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/(特别行政区|自治区|自治州|地区)$/u, "")
    .replace(/(省|市|区|县|旗)$/u, "")
    .trim();
}

function transliterateLocationName(value) {
  const normalized = normalizeString(value, "");
  if (!normalized || !/[\u3400-\u9fff]/u.test(normalized)) {
    return null;
  }

  const raw = pinyin(normalized, {
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
    v: false
  });

  const tokens = Array.isArray(raw)
    ? raw
        .map((token) => String(token || "").trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (!tokens.length) {
    return null;
  }

  return {
    spaced: tokens.join(" "),
    compact: tokens.join("")
  };
}

function readCache(cacheMap, key) {
  const entry = cacheMap.get(key);
  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (entry.expiresAt > now) {
    return {
      value: entry.value,
      isStale: false
    };
  }
  if (entry.staleUntil > now) {
    return {
      value: entry.value,
      isStale: true
    };
  }
  cacheMap.delete(key);
  return null;
}

function writeCache(cacheMap, key, value, ttlSeconds, staleTtlSeconds) {
  const now = Date.now();
  cacheMap.set(key, {
    value,
    expiresAt: now + Math.max(ttlSeconds, 30) * 1000,
    staleUntil: now + Math.max(ttlSeconds + staleTtlSeconds, 60) * 1000
  });
}

function normalizeProviderType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "open-meteo") {
    return "open_meteo";
  }
  return normalized === "open_meteo" ? normalized : DEFAULT_WEATHER_CONFIG.providerType;
}

function normalizeTemperatureUnit(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["celsius", "fahrenheit"].includes(normalized) ? normalized : DEFAULT_WEATHER_CONFIG.temperatureUnit;
}

function normalizeWindSpeedUnit(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["kmh", "ms", "mph", "kn"].includes(normalized) ? normalized : DEFAULT_WEATHER_CONFIG.windSpeedUnit;
}

function normalizePrecipitationUnit(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["mm", "inch"].includes(normalized) ? normalized : DEFAULT_WEATHER_CONFIG.precipitationUnit;
}

function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeInteger(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeFloat(value, fallback = null) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "on", "enabled"].includes(String(value).trim().toLowerCase());
}

function providerLabel(providerType) {
  return WEATHER_PROVIDER_LABELS[providerType] || providerType;
}

function buildResolvedLocationName(result) {
  return [result.country, result.admin1, result.admin2, result.name]
    .filter(Boolean)
    .join(" / ");
}

function sanitizeErrorMessage(error) {
  const message = String(error?.message || error || "").trim();
  return message || "未知错误";
}

function truncateText(value, maxLength) {
  const normalized = String(value || "").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function formatDisplayNumber(value, digits = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : String(value);
}

function unitLabelForTemperature(unit) {
  return unit === "fahrenheit" ? "°F" : "°C";
}

function unitLabelForWindSpeed(unit) {
  if (unit === "ms") {
    return "m/s";
  }
  if (unit === "mph") {
    return "mph";
  }
  if (unit === "kn") {
    return "kn";
  }
  return "km/h";
}

function unitLabelForPrecipitation(unit) {
  return unit === "inch" ? "inch" : "mm";
}

function weatherCodeLabel(code, isDay) {
  const normalized = Number(code);
  if (!Number.isFinite(normalized)) {
    return "天气未知";
  }

  const labelMap = {
    0: isDay ? "晴" : "晴夜",
    1: isDay ? "基本晴朗" : "基本晴夜",
    2: "局部多云",
    3: "阴天",
    45: "雾",
    48: "冻雾",
    51: "小毛雨",
    53: "毛雨",
    55: "强毛雨",
    56: "冻毛雨",
    57: "强冻毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    66: "冻雨",
    67: "强冻雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    77: "雪粒",
    80: "阵雨",
    81: "较强阵雨",
    82: "强阵雨",
    85: "阵雪",
    86: "强阵雪",
    95: "雷暴",
    96: "雷暴夹冰雹",
    99: "强雷暴夹冰雹"
  };
  return labelMap[normalized] || `天气代码 ${normalized}`;
}

module.exports = {
  getWeatherProviderConfig,
  resolveAreaWeather
};
