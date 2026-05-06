<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>区域管理</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadAreas">刷新</button>
          <button v-if="canCreate" class="primary-button" @click="startCreate">新增区域</button>
        </div>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="区域编号 / 名称" />
        </label>
        <label class="filter-item">
          <span>状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="enabled">启用</option>
            <option value="disabled">禁用</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadAreas">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>区域编号</th>
            <th>区域名称</th>
            <th>类型</th>
            <th>作物</th>
            <th>生长阶段</th>
            <th>负责人</th>
            <th>网关/传感器/执行器</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in areas" :key="item.id">
            <td>{{ item.areaCode }}</td>
            <td>{{ item.areaName }}</td>
            <td>{{ enumLabel("areaType", item.areaType) }}</td>
            <td>{{ formatAreaCrop(item) }}</td>
            <td>{{ item.cropStageName || item.growthStage || "-" }}</td>
            <td>{{ item.ownerName || "-" }}</td>
            <td>{{ item.gatewayCount }}/{{ item.sensorCount }}/{{ item.actuatorCount }}</td>
            <td><span class="tag" :class="item.status === 'enabled' ? 'tag-success' : 'tag-warning'">{{ enumLabel("status", item.status) }}</span></td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="showDetail(item)">详情</button>
                <button v-if="canEdit" class="table-link" @click="startEdit(item)">编辑</button>
                <button v-if="canDelete" class="table-link" @click="deleteArea(item)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && areas.length === 0">
            <td colspan="9" class="empty-cell">暂无区域数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载区域数据...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingAreaId ? "编辑区域" : "新增区域" }}</h2>
          <span class="tag tag-p0">P0</span>
        </div>
        <form class="form-grid" @submit.prevent="saveArea">
          <label class="form-item">
            <span>区域编号</span>
            <input v-model="form.areaCode" type="text" :disabled="Boolean(editingAreaId)" placeholder="如 GH-EAST-001" />
          </label>
          <label class="form-item">
            <span>区域名称</span>
            <input v-model="form.areaName" type="text" placeholder="区域名称" />
          </label>
          <label class="form-item">
            <span>区域类型</span>
            <select v-model="form.areaType">
              <option value="greenhouse">温室</option>
              <option value="open_field">露天</option>
              <option value="experiment">实验区</option>
            </select>
          </label>
          <label class="form-item">
            <span>层级</span>
            <input v-model="form.areaLevel" type="number" min="1" />
          </label>
          <label class="form-item">
            <span>面积</span>
            <input v-model="form.areaSize" type="number" min="0" step="0.01" placeholder="平方米" />
          </label>
          <label class="form-item">
            <span>负责人</span>
            <select v-model="form.ownerUserId">
              <option value="">未分配</option>
              <option v-for="user in userOptions" :key="user.id" :value="user.id">
                {{ user.realName }} / {{ user.username }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>作物品类</span>
            <select v-model="form.cropSpeciesId">
              <option value="">未绑定</option>
              <option v-for="item in cropOptions.species" :key="item.id" :value="String(item.id)">
                {{ item.speciesName }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>作物品种</span>
            <select v-model="form.cropVarietyId" :disabled="!availableVarieties.length">
              <option value="">通用品种 / 未绑定</option>
              <option v-for="item in availableVarieties" :key="item.id" :value="String(item.id)">
                {{ item.varietyName }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>生长阶段</span>
            <select v-model="form.cropStageId" :disabled="!availableStages.length">
              <option value="">未绑定</option>
              <option v-for="item in availableStages" :key="item.id" :value="String(item.id)">
                {{ item.stageName }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>天气定位名称</span>
            <input v-model="form.weatherLocationName" type="text" placeholder="如 上海市浦东新区 / 深圳市南山区（建议填写真实城市或区县名）" />
          </label>
          <label class="form-item">
            <span>天气源编码</span>
            <input v-model="form.weatherProviderRef" type="text" placeholder="预留给第三方天气源的定位编码" />
          </label>
          <label class="form-item">
            <span>纬度</span>
            <input v-model="form.latitude" type="number" step="0.000001" placeholder="如 31.230416" />
          </label>
          <label class="form-item">
            <span>经度</span>
            <input v-model="form.longitude" type="number" step="0.000001" placeholder="如 121.473701" />
          </label>
          <div class="form-span area-weather-config-panel">
            <div class="area-weather-panel-head">
              <div>
                <strong>天气接入测试</strong>
                <span>保存前先测试定位是否能解析，成功后可直接回填经纬度，首页和作物建议会同步使用。</span>
              </div>
              <div class="area-weather-actions">
                <button class="ghost-button" type="button" @click="fillWeatherLocationFromAreaName" :disabled="!form.areaName">
                  使用区域名称
                </button>
                <button class="ghost-button" type="button" @click="testFormWeather" :disabled="weatherTesting">
                  {{ weatherTesting ? "测试中..." : "测试天气" }}
                </button>
                <button
                  v-if="canApplyWeatherLocation"
                  class="primary-button"
                  type="button"
                  @click="applyWeatherTestLocation"
                >
                  回填经纬度
                </button>
              </div>
            </div>
            <div v-if="weatherTestError" class="error-text inline-error">{{ weatherTestError }}</div>
            <div v-if="weatherTestResult" class="area-weather-result">
              <div class="area-weather-result-head">
                <span class="tag" :class="weatherStatusClass(weatherTestWeather.status)">
                  {{ weatherStatusLabel(weatherTestWeather.status) }}
                </span>
                <strong>{{ weatherTestWeather.summary || "天气测试已返回结果" }}</strong>
              </div>
              <div class="area-weather-result-grid">
                <div>
                  <small>解析位置</small>
                  <strong>{{ formatWeatherLocationName(weatherTestWeather.location) }}</strong>
                </div>
                <div>
                  <small>经纬度</small>
                  <strong>{{ formatWeatherCoordinates(weatherTestWeather.location) }}</strong>
                </div>
                <div>
                  <small>当前天气</small>
                  <strong>{{ formatWeatherCurrent(weatherTestWeather.current) }}</strong>
                </div>
                <div>
                  <small>数据源</small>
                  <strong>{{ weatherTestWeather.providerLabel || weatherTestWeather.providerType || "-" }}</strong>
                </div>
              </div>
            </div>
          </div>
          <label class="form-item">
            <span>状态</span>
            <select v-model="form.status">
              <option value="enabled">启用</option>
              <option value="disabled">禁用</option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>备注</span>
            <textarea v-model="form.remark" rows="3" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving || (editingAreaId ? !canEdit : !canCreate)">
              {{ saving ? "保存中..." : editingAreaId ? "保存修改" : "创建区域" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>区域详情</h2>
          <span class="tag tag-p1">{{ selectedArea?.areaCode || "未选择" }}</span>
        </div>
        <div v-if="selectedArea" class="detail-grid">
          <div>
            <div class="detail-label">区域名称</div>
            <div class="detail-value">{{ selectedArea.areaName }}</div>
          </div>
          <div>
            <div class="detail-label">创建时间</div>
            <div class="detail-value">{{ formatDateTime(selectedArea.createdAt) }}</div>
          </div>
          <div>
            <div class="detail-label">区域类型</div>
            <div class="detail-value">{{ enumLabel("areaType", selectedArea.areaType) }}</div>
          </div>
          <div>
            <div class="detail-label">负责人</div>
            <div class="detail-value">{{ selectedArea.ownerName || "-" }}</div>
          </div>
          <div>
            <div class="detail-label">作物类型</div>
            <div class="detail-value">{{ formatAreaCrop(selectedArea) }}</div>
          </div>
          <div>
            <div class="detail-label">生长阶段</div>
            <div class="detail-value">{{ selectedArea.cropStageName || selectedArea.growthStage || "-" }}</div>
          </div>
          <div>
            <div class="detail-label">天气定位</div>
            <div class="detail-value">{{ selectedArea.weatherLocationName || "-" }}</div>
          </div>
          <div>
            <div class="detail-label">天气源编码</div>
            <div class="detail-value">{{ selectedArea.weatherProviderRef || "-" }}</div>
          </div>
          <div>
            <div class="detail-label">纬度</div>
            <div class="detail-value">{{ selectedArea.latitude ?? "-" }}</div>
          </div>
          <div>
            <div class="detail-label">经度</div>
            <div class="detail-value">{{ selectedArea.longitude ?? "-" }}</div>
          </div>
          <div class="detail-span">
            <div class="detail-label">备注</div>
            <div class="detail-value">{{ selectedArea.remark || "-" }}</div>
          </div>
        </div>
        <div v-if="selectedArea" class="area-weather-detail-card">
          <div>
            <strong>区域天气状态</strong>
            <span>{{ selectedArea.weatherLocationName || selectedArea.areaName }} · {{ selectedArea.latitude ?? "未填纬度" }}, {{ selectedArea.longitude ?? "未填经度" }}</span>
          </div>
          <div class="area-weather-actions">
            <button class="ghost-button" type="button" @click="testSelectedAreaWeather" :disabled="weatherTesting">
              {{ weatherTesting ? "测试中..." : "测试当前区域天气" }}
            </button>
            <button v-if="canEdit" class="primary-button" type="button" @click="startEdit(selectedArea)">编辑天气配置</button>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一个区域查看详情。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";
import { hasPermission } from "../lib/session";

const route = useRoute();
const loading = ref(false);
const saving = ref(false);
const weatherTesting = ref(false);
const errorMessage = ref("");
const message = ref("");
const weatherTestError = ref("");
const areas = ref([]);
const userOptions = ref([]);
const cropOptions = reactive({
  species: [],
  varieties: [],
  stages: []
});
const selectedArea = ref(null);
const editingAreaId = ref(null);
const routeAreaApplied = ref(false);
const weatherTestResult = ref(null);

const filters = reactive({
  keyword: "",
  status: ""
});

const form = reactive({
  areaCode: "",
  areaName: "",
  areaType: "greenhouse",
  areaLevel: 1,
  areaSize: "",
  cropSpeciesId: "",
  cropVarietyId: "",
  cropStageId: "",
  weatherLocationName: "",
  weatherProviderRef: "",
  latitude: "",
  longitude: "",
  ownerUserId: "",
  status: "enabled",
  remark: ""
});

const canCreate = hasPermission("area:add");
const canEdit = hasPermission("area:edit");
const canDelete = hasPermission("area:delete");

const availableVarieties = computed(() =>
  cropOptions.varieties.filter((item) => String(item.speciesId) === String(form.cropSpeciesId))
);

const availableStages = computed(() =>
  cropOptions.stages.filter((item) => String(item.speciesId) === String(form.cropSpeciesId))
);
const weatherTestWeather = computed(() => weatherTestResult.value?.weather || {});
const canApplyWeatherLocation = computed(() => {
  const location = weatherTestWeather.value?.location;
  return location?.latitude !== null && location?.latitude !== undefined
    && location?.longitude !== null && location?.longitude !== undefined;
});

function resetFilters() {
  filters.keyword = "";
  filters.status = "";
  loadAreas();
}

function resetForm() {
  editingAreaId.value = null;
  form.areaCode = "";
  form.areaName = "";
  form.areaType = "greenhouse";
  form.areaLevel = 1;
  form.areaSize = "";
  form.cropSpeciesId = "";
  form.cropVarietyId = "";
  form.cropStageId = "";
  form.weatherLocationName = "";
  form.weatherProviderRef = "";
  form.latitude = "";
  form.longitude = "";
  form.ownerUserId = "";
  form.status = "enabled";
  form.remark = "";
  clearWeatherTest();
}

function showDetail(item) {
  selectedArea.value = item;
}

function startCreate() {
  resetForm();
  message.value = "";
  errorMessage.value = "";
}

function startEdit(item) {
  editingAreaId.value = item.id;
  form.areaCode = item.areaCode;
  form.areaName = item.areaName;
  form.areaType = item.areaType || "greenhouse";
  form.areaLevel = item.areaLevel || 1;
  form.areaSize = item.areaSize ?? "";
  form.cropSpeciesId = item.cropSpeciesId ? String(item.cropSpeciesId) : "";
  form.cropVarietyId = item.cropVarietyId ? String(item.cropVarietyId) : "";
  form.cropStageId = item.cropStageId ? String(item.cropStageId) : "";
  form.weatherLocationName = item.weatherLocationName || "";
  form.weatherProviderRef = item.weatherProviderRef || "";
  form.latitude = item.latitude ?? "";
  form.longitude = item.longitude ?? "";
  form.ownerUserId = item.ownerUserId || "";
  form.status = item.status || "enabled";
  form.remark = item.remark || "";
  selectedArea.value = item;
  clearWeatherTest();
}

async function loadAreas() {
  loading.value = true;
  errorMessage.value = "";
  try {
    areas.value = await apiRequest(`/api/v1/areas${buildQuery(filters)}`);
    if (selectedArea.value) {
      selectedArea.value = areas.value.find((item) => item.id === selectedArea.value.id) || areas.value[0] || null;
    } else if (areas.value[0]) {
      selectedArea.value = areas.value[0];
    }
    applyRouteAreaSelection();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

function applyRouteAreaSelection() {
  if (routeAreaApplied.value) {
    return;
  }
  const routeAreaId = firstQueryValue(route.query.areaId);
  if (!routeAreaId) {
    routeAreaApplied.value = true;
    return;
  }
  const matchedArea = areas.value.find((item) => String(item.id) === String(routeAreaId));
  if (!matchedArea) {
    return;
  }
  selectedArea.value = matchedArea;
  if (canEdit) {
    startEdit(matchedArea);
    message.value = `已定位到 ${matchedArea.areaName}，可直接测试或编辑天气配置`;
  }
  routeAreaApplied.value = true;
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadUsers() {
  try {
    userOptions.value = await apiRequest("/api/v1/system/user-options");
  } catch {
    userOptions.value = [];
  }
}

async function loadCropOptions() {
  try {
    const result = await apiRequest("/api/v1/crop-knowledge/options");
    cropOptions.species = result.species || [];
    cropOptions.varieties = result.varieties || [];
    cropOptions.stages = result.stages || [];
  } catch {
    cropOptions.species = [];
    cropOptions.varieties = [];
    cropOptions.stages = [];
  }
}

function formatAreaCrop(item) {
  return [item?.cropSpeciesName, item?.cropVarietyName].filter(Boolean).join(" / ") || item?.cropType || "-";
}

async function saveArea() {
  if (editingAreaId.value ? !canEdit : !canCreate) {
    return;
  }
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      areaCode: form.areaCode,
      areaName: form.areaName,
      areaType: form.areaType,
      areaLevel: Number(form.areaLevel) || 1,
      areaSize: form.areaSize === "" ? null : Number(form.areaSize),
      cropSpeciesId: form.cropSpeciesId || null,
      cropVarietyId: form.cropVarietyId || null,
      cropStageId: form.cropStageId || null,
      weatherLocationName: form.weatherLocationName,
      weatherProviderRef: form.weatherProviderRef,
      latitude: form.latitude === "" ? null : Number(form.latitude),
      longitude: form.longitude === "" ? null : Number(form.longitude),
      ownerUserId: form.ownerUserId || null,
      status: form.status,
      remark: form.remark
    };

    if (editingAreaId.value) {
      await apiRequest(`/api/v1/areas/${editingAreaId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "区域已更新";
    } else {
      await apiRequest("/api/v1/areas", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "区域已创建";
    }
    resetForm();
    await loadAreas();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

function clearWeatherTest() {
  weatherTestResult.value = null;
  weatherTestError.value = "";
}

function fillWeatherLocationFromAreaName() {
  if (!form.weatherLocationName && form.areaName) {
    form.weatherLocationName = form.areaName;
    return;
  }
  if (form.areaName) {
    form.weatherLocationName = form.areaName;
  }
}

function buildWeatherPreviewPayload(source = "form") {
  const base = source === "selected" && selectedArea.value
    ? selectedArea.value
    : {
        id: editingAreaId.value,
        areaCode: form.areaCode,
        areaName: form.areaName,
        weatherLocationName: form.weatherLocationName,
        weatherProviderRef: form.weatherProviderRef,
        latitude: form.latitude,
        longitude: form.longitude
      };

  return {
    areaId: base.id || editingAreaId.value || null,
    areaCode: base.areaCode || form.areaCode,
    areaName: base.areaName || form.areaName,
    weatherLocationName: base.weatherLocationName || "",
    weatherProviderRef: base.weatherProviderRef || "",
    latitude: base.latitude === "" ? null : base.latitude,
    longitude: base.longitude === "" ? null : base.longitude
  };
}

async function testFormWeather() {
  await testWeather("form");
}

async function testSelectedAreaWeather() {
  if (!selectedArea.value) {
    return;
  }
  if (canEdit) {
    startEdit(selectedArea.value);
    await testWeather("form");
    return;
  }
  await testWeather("selected");
}

async function testWeather(source = "form") {
  weatherTesting.value = true;
  weatherTestError.value = "";
  weatherTestResult.value = null;
  try {
    weatherTestResult.value = await apiRequest("/api/v1/areas/weather-preview", {
      method: "POST",
      timeoutMs: 15000,
      body: JSON.stringify(buildWeatherPreviewPayload(source))
    });
  } catch (error) {
    weatherTestError.value = error.message;
  } finally {
    weatherTesting.value = false;
  }
}

function applyWeatherTestLocation() {
  const location = weatherTestWeather.value?.location;
  if (!location) {
    return;
  }
  if (location.latitude !== null && location.latitude !== undefined) {
    form.latitude = String(location.latitude);
  }
  if (location.longitude !== null && location.longitude !== undefined) {
    form.longitude = String(location.longitude);
  }
  if (location.name && !form.weatherLocationName) {
    form.weatherLocationName = location.name;
  }
  if (location.providerRef && !form.weatherProviderRef) {
    form.weatherProviderRef = location.providerRef;
  }
}

function weatherStatusClass(status) {
  if (status === "live" || status === "stale") {
    return "tag-success";
  }
  if (status === "not_configured" || status === "location_unresolved") {
    return "tag-warning";
  }
  return "tag-danger";
}

function weatherStatusLabel(status) {
  if (status === "live") {
    return "实时";
  }
  if (status === "stale") {
    return "缓存";
  }
  if (status === "not_configured") {
    return "待配置";
  }
  if (status === "location_unresolved") {
    return "待定位";
  }
  if (status === "disabled") {
    return "已关闭";
  }
  if (status === "provider_error") {
    return "异常";
  }
  return "未知";
}

function formatWeatherLocationName(location) {
  return location?.name || location?.providerRef || "-";
}

function formatWeatherCoordinates(location) {
  if (location?.latitude === null || location?.latitude === undefined || location?.longitude === null || location?.longitude === undefined) {
    return "-";
  }
  return `${location.latitude}, ${location.longitude}`;
}

function formatWeatherCurrent(current) {
  if (!current) {
    return "-";
  }
  const segments = [];
  if (current.temperature !== null && current.temperature !== undefined) {
    segments.push(`${current.temperature}${current.temperatureUnit || "℃"}`);
  }
  if (current.weatherLabel) {
    segments.push(current.weatherLabel);
  }
  if (current.relativeHumidity !== null && current.relativeHumidity !== undefined) {
    segments.push(`湿度 ${current.relativeHumidity}${current.humidityUnit || "%"}`);
  }
  return segments.join(" · ") || "-";
}

async function deleteArea(item) {
  if (!window.confirm(`确定删除区域“${item.areaName}”吗？`)) {
    return;
  }

  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/areas/${item.id}`, {
      method: "DELETE"
    });
    message.value = `区域 ${item.areaName} 已删除`;

    if (selectedArea.value?.id === item.id) {
      selectedArea.value = null;
    }
    if (editingAreaId.value === item.id) {
      resetForm();
    }

    await loadAreas();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

watch(
  () => form.cropSpeciesId,
  () => {
    if (!availableVarieties.value.some((item) => String(item.id) === String(form.cropVarietyId))) {
      form.cropVarietyId = "";
    }
    if (!availableStages.value.some((item) => String(item.id) === String(form.cropStageId))) {
      form.cropStageId = "";
    }
  }
);

onMounted(async () => {
  await Promise.all([loadUsers(), loadCropOptions(), loadAreas()]);
});
</script>
