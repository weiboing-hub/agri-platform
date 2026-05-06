<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>作物知识库</h2>
          <p class="panel-subtitle">按作物、品种、生长阶段维护推荐目标，并结合区域实时值生成建议。</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" @click="reloadAll">刷新</button>
        </div>
      </div>

      <div class="settings-overview">
        <div class="settings-overview-card">
          <small>作物品类</small>
          <strong>{{ species.length }}</strong>
          <span>当前租户下已维护的作物知识主档。</span>
        </div>
        <div class="settings-overview-card">
          <small>推荐目标</small>
          <strong>{{ enabledTargetCount }}</strong>
          <span>已启用的指标推荐区间，可直接给区域生成建议。</span>
        </div>
        <div class="settings-overview-card">
          <small>已绑定区域</small>
          <strong>{{ configuredAreaCount }}</strong>
          <span>已绑定作物与阶段的区域可直接显示推荐建议。</span>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>
    </section>

    <section class="panel split-panel crop-knowledge-hero">
      <div class="stack">
        <div class="panel-header">
          <div>
            <h2>区域推荐建议</h2>
            <p class="panel-subtitle">先选择一个区域，再查看该区域当前作物阶段对应的目标区间和偏差。</p>
          </div>
          <div class="inline-actions">
            <button class="ghost-button" @click="loadRecommendation" :disabled="!selectedAreaId || recommendationLoading">
              {{ recommendationLoading ? "加载中..." : "刷新推荐" }}
            </button>
          </div>
        </div>

        <div class="toolbar crop-knowledge-toolbar">
          <label class="filter-item crop-knowledge-area-filter">
            <span>当前区域</span>
            <select v-model="selectedAreaId" @change="loadRecommendation">
              <option value="">请选择区域</option>
              <option v-for="item in areaOptions" :key="item.id" :value="String(item.id)">
                {{ item.areaName }} / {{ item.areaCode }}
              </option>
            </select>
          </label>
        </div>

        <div v-if="recommendationError" class="error-text inline-error">{{ recommendationError }}</div>

        <div v-if="selectedArea" class="detail-grid">
          <div class="detail-card">
            <div class="detail-label">当前作物</div>
            <div class="detail-value">{{ formatAreaCrop(selectedArea) }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">生长阶段</div>
            <div class="detail-value">{{ selectedArea.cropStageName || selectedArea.growthStage || "未绑定" }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">推荐状态</div>
            <div class="detail-value">
              <span class="tag" :class="recommendationStatusClass(recommendation.status)">
                {{ recommendationStatusLabel(recommendation.status) }}
              </span>
            </div>
          </div>
        </div>

        <div class="detail-card">
          <div class="detail-label">推荐摘要</div>
          <div class="detail-value">
            {{ recommendation.summary || "请选择区域后查看推荐建议。" }}
          </div>
        </div>

        <div class="crop-decision-panel">
          <div class="crop-decision-head">
            <div>
              <h3>规则型种植决策</h3>
              <p>第一版不依赖复杂 AI，只根据作物阶段目标区间和当前传感器值给出现场建议。</p>
            </div>
            <span class="tag" :class="cropDecisionPriorityClass">{{ cropDecisionPriorityLabel }}</span>
          </div>

          <div class="crop-decision-brief">
            <strong>{{ cropDecisionPriorityText }}</strong>
            <span>后续可叠加天气、历史趋势和日报/周报生成更完整的建议报告。</span>
          </div>

          <div class="crop-decision-grid">
            <article
              v-for="card in cropDecisionCards"
              :key="card.key"
              class="crop-decision-card"
              :class="`crop-decision-card-${card.status}`"
            >
              <div class="crop-decision-card-head">
                <div>
                  <strong>{{ card.title }}</strong>
                  <span>{{ card.subtitle }}</span>
                </div>
                <span class="tag" :class="decisionStatusClass(card.status)">{{ card.statusLabel }}</span>
              </div>
              <div class="crop-decision-values">
                <div>
                  <small>当前</small>
                  <strong>{{ card.currentText }}</strong>
                </div>
                <div>
                  <small>推荐</small>
                  <strong>{{ card.targetText }}</strong>
                </div>
              </div>
              <p>{{ card.actionText }}</p>
            </article>
          </div>
        </div>

        <section class="crop-report-panel">
          <div class="crop-report-head">
            <div>
              <h3>规则型建议报告</h3>
              <p>把实时传感器、天气上下文和作物知识库组合成一份现场建议，不调用复杂 AI。</p>
            </div>
            <span class="tag" :class="cropDecisionReport.levelClass">{{ cropDecisionReport.levelLabel }}</span>
          </div>

          <div class="crop-report-summary">
            <strong>{{ cropDecisionReport.title }}</strong>
            <span>{{ cropDecisionReport.summary }}</span>
          </div>

          <div class="crop-report-grid">
            <article class="crop-report-card">
              <small>作物上下文</small>
              <strong>{{ cropDecisionReport.cropText }}</strong>
              <span>{{ cropDecisionReport.stageText }}</span>
            </article>
            <article class="crop-report-card">
              <small>天气上下文</small>
              <strong>{{ cropDecisionReport.weatherTitle }}</strong>
              <span>{{ cropDecisionReport.weatherSummary }}</span>
            </article>
            <article class="crop-report-card">
              <small>实时接入</small>
              <strong>{{ cropDecisionReport.realtimeTitle }}</strong>
              <span>{{ cropDecisionReport.realtimeSummary }}</span>
            </article>
          </div>

          <div class="crop-report-actions">
            <article v-for="item in cropDecisionReport.actions" :key="item.key" class="crop-report-action">
              <span class="tag" :class="item.className">{{ item.label }}</span>
              <strong>{{ item.title }}</strong>
              <p>{{ item.text }}</p>
            </article>
          </div>

          <div class="crop-report-evidence">
            <span>依据：推荐目标 {{ recommendation.metrics.length }} 项</span>
            <span>实时值 {{ cropDecisionReport.realtimeMetricCount }} 项</span>
            <span>{{ cropDecisionReport.weatherEvidence }}</span>
          </div>
        </section>

        <section class="crop-snapshot-panel">
          <div class="crop-snapshot-head">
            <div>
              <h3>建议快照</h3>
              <p>把当前规则型建议保存为历史记录，后续日报、周报和 AI 报告可以直接引用。</p>
            </div>
            <button
              class="primary-button"
              type="button"
              @click="saveRecommendationSnapshot"
              :disabled="!selectedAreaId || recommendationLoading || snapshotSaving"
            >
              {{ snapshotSaving ? "保存中..." : "保存本次建议" }}
            </button>
          </div>

          <div v-if="snapshotError" class="error-text inline-error">{{ snapshotError }}</div>
          <div v-if="snapshotsLoading" class="muted-text">正在加载建议快照...</div>

          <div v-if="recommendationSnapshots.length > 0" class="crop-snapshot-list">
            <article v-for="item in recommendationSnapshots" :key="item.id" class="crop-snapshot-card">
              <div class="crop-snapshot-card-head">
                <div>
                  <strong>{{ item.reportTitle }}</strong>
                  <span>{{ item.snapshotNo }}</span>
                </div>
                <span class="tag" :class="snapshotLevelClass(item.reportLevel)">{{ snapshotLevelLabel(item.reportLevel) }}</span>
              </div>
              <p>{{ item.summaryText }}</p>
              <div class="crop-snapshot-meta">
                <span>{{ item.cropText || "-" }} · {{ item.stageText || "-" }}</span>
                <span>天气：{{ item.weatherSummary || snapshotWeatherStatusLabel(item.weatherStatus) }}</span>
                <span>{{ formatDateTime(item.createdAt) }} · {{ item.createdByName || "系统用户" }}</span>
              </div>
              <div v-if="item.actionsSnapshot?.length" class="crop-snapshot-actions">
                <span
                  v-for="action in item.actionsSnapshot.slice(0, 4)"
                  :key="`${item.id}-${action.type}-${action.title}`"
                >
                  {{ action.label }} / {{ action.title }}
                </span>
              </div>
            </article>
          </div>
          <div v-else-if="!snapshotsLoading" class="empty-state crop-snapshot-empty">当前区域还没有保存过建议快照。</div>
        </section>

        <table class="simple-table">
          <thead>
            <tr>
              <th>指标</th>
              <th>当前值</th>
              <th>推荐区间</th>
              <th>最佳值</th>
              <th>状态</th>
              <th>建议</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in recommendation.metrics" :key="item.metricCode">
              <td>
                <div>{{ item.metricName }}</div>
                <div class="muted-text">{{ item.metricCode }}</div>
              </td>
              <td>
                <div>{{ formatMetricCurrentValue(item) }}</div>
                <div class="muted-text">{{ formatDateTime(item.collectedAt) }}</div>
              </td>
              <td>{{ formatTargetRange(item) }}</td>
              <td>{{ formatOptimalValue(item) }}</td>
              <td>
                <span class="tag" :class="recommendationMetricClass(item.deviationStatus)">
                  {{ recommendationMetricLabel(item.deviationStatus) }}
                </span>
                <div class="muted-text">{{ item.deviationText }}</div>
              </td>
              <td>{{ item.advisoryText || item.toleranceText || "-" }}</td>
              <td>{{ item.sourceName || "未标注" }}</td>
            </tr>
            <tr v-if="!recommendationLoading && recommendation.metrics.length === 0">
              <td colspan="7" class="empty-cell">当前区域暂无可展示的推荐目标。</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="stack">
        <div class="detail-card">
          <div class="detail-label">使用说明</div>
          <div class="detail-value">先在区域管理中绑定作物品类和生长阶段，再在这里查看目标范围与当前值偏差。</div>
        </div>
        <div class="detail-card">
          <div class="detail-label">推荐逻辑</div>
          <div class="detail-value">系统会优先匹配“品种 + 阶段”目标；若没有品种专属目标，则回退到作物品类 + 阶段的通用目标。</div>
        </div>
        <div class="detail-card">
          <div class="detail-label">当前接入情况</div>
          <div class="detail-value">没有实时值的指标会显示“未接入”，可以作为后续增加传感器的依据。</div>
        </div>
      </div>
    </section>

    <section class="panel" v-if="canManage">
      <div class="panel-header">
        <div>
          <h2>知识库配置</h2>
          <p class="panel-subtitle">第一版先提供作物品类、品种、生长阶段和推荐目标的基础维护。</p>
        </div>
      </div>

      <div class="stack">
        <section class="detail-card">
          <div class="panel-header">
            <h3>作物品类</h3>
            <div class="inline-actions">
              <button class="ghost-button" @click="resetSpeciesForm">清空</button>
              <button class="primary-button" @click="saveSpecies" :disabled="savingSpecies">
                {{ savingSpecies ? "保存中..." : speciesForm.id ? "保存品类" : "新增品类" }}
              </button>
            </div>
          </div>

          <form class="form-grid" @submit.prevent="saveSpecies">
            <label class="form-item">
              <span>品类编码</span>
              <input v-model="speciesForm.speciesCode" type="text" :disabled="Boolean(speciesForm.id)" placeholder="例如 tomato" />
            </label>
            <label class="form-item">
              <span>品类名称</span>
              <input v-model="speciesForm.speciesName" type="text" placeholder="例如 番茄" />
            </label>
            <label class="form-item">
              <span>分类</span>
              <input v-model="speciesForm.categoryName" type="text" placeholder="例如 茄果类" />
            </label>
            <label class="form-item">
              <span>学名</span>
              <input v-model="speciesForm.scientificName" type="text" placeholder="例如 Solanum lycopersicum" />
            </label>
            <label class="form-item">
              <span>排序</span>
              <input v-model="speciesForm.sortOrder" type="number" min="1" />
            </label>
            <label class="form-item">
              <span>状态</span>
              <select v-model="speciesForm.enabled">
                <option :value="true">启用</option>
                <option :value="false">停用</option>
              </select>
            </label>
            <label class="form-item form-span">
              <span>备注</span>
              <textarea v-model="speciesForm.remark" rows="2"></textarea>
            </label>
          </form>

          <table class="simple-table">
            <thead>
              <tr>
                <th>编码</th>
                <th>名称</th>
                <th>分类</th>
                <th>品种/阶段/目标</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in species" :key="item.id">
                <td>{{ item.speciesCode }}</td>
                <td>{{ item.speciesName }}</td>
                <td>{{ item.categoryName || "-" }}</td>
                <td>{{ item.varietyCount }}/{{ item.stageCount }}/{{ item.targetCount }}</td>
                <td><span class="tag" :class="item.status === 'enabled' ? 'tag-success' : 'tag-warning'">{{ item.status === "enabled" ? "启用" : "停用" }}</span></td>
                <td>
                  <div class="table-actions">
                    <button class="table-link" @click="editSpecies(item)">编辑</button>
                    <button class="table-link" @click="removeSpecies(item)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="detail-card">
          <div class="panel-header">
            <h3>作物品种</h3>
            <div class="inline-actions">
              <button class="ghost-button" @click="resetVarietyForm">清空</button>
              <button class="primary-button" @click="saveVariety" :disabled="savingVariety">
                {{ savingVariety ? "保存中..." : varietyForm.id ? "保存品种" : "新增品种" }}
              </button>
            </div>
          </div>

          <form class="form-grid" @submit.prevent="saveVariety">
            <label class="form-item">
              <span>作物品类</span>
              <select v-model="varietyForm.speciesId">
                <option value="">请选择</option>
                <option v-for="item in species" :key="item.id" :value="String(item.id)">{{ item.speciesName }}</option>
              </select>
            </label>
            <label class="form-item">
              <span>品种编码</span>
              <input v-model="varietyForm.varietyCode" type="text" :disabled="Boolean(varietyForm.id)" placeholder="例如 cherry_tomato" />
            </label>
            <label class="form-item">
              <span>品种名称</span>
              <input v-model="varietyForm.varietyName" type="text" placeholder="例如 樱桃番茄" />
            </label>
            <label class="form-item">
              <span>排序</span>
              <input v-model="varietyForm.sortOrder" type="number" min="1" />
            </label>
            <label class="form-item">
              <span>状态</span>
              <select v-model="varietyForm.enabled">
                <option :value="true">启用</option>
                <option :value="false">停用</option>
              </select>
            </label>
            <label class="form-item form-span">
              <span>备注</span>
              <textarea v-model="varietyForm.remark" rows="2"></textarea>
            </label>
          </form>

          <table class="simple-table">
            <thead>
              <tr>
                <th>品类</th>
                <th>编码</th>
                <th>名称</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in varieties" :key="item.id">
                <td>{{ item.speciesName }}</td>
                <td>{{ item.varietyCode }}</td>
                <td>{{ item.varietyName }}</td>
                <td><span class="tag" :class="item.status === 'enabled' ? 'tag-success' : 'tag-warning'">{{ item.status === "enabled" ? "启用" : "停用" }}</span></td>
                <td>
                  <div class="table-actions">
                    <button class="table-link" @click="editVariety(item)">编辑</button>
                    <button class="table-link" @click="removeVariety(item)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="detail-card">
          <div class="panel-header">
            <h3>生长阶段</h3>
            <div class="inline-actions">
              <button class="ghost-button" @click="resetStageForm">清空</button>
              <button class="primary-button" @click="saveStage" :disabled="savingStage">
                {{ savingStage ? "保存中..." : stageForm.id ? "保存阶段" : "新增阶段" }}
              </button>
            </div>
          </div>

          <form class="form-grid" @submit.prevent="saveStage">
            <label class="form-item">
              <span>作物品类</span>
              <select v-model="stageForm.speciesId">
                <option value="">请选择</option>
                <option v-for="item in species" :key="item.id" :value="String(item.id)">{{ item.speciesName }}</option>
              </select>
            </label>
            <label class="form-item">
              <span>阶段编码</span>
              <input v-model="stageForm.stageCode" type="text" :disabled="Boolean(stageForm.id)" placeholder="例如 flowering_fruiting" />
            </label>
            <label class="form-item">
              <span>阶段名称</span>
              <input v-model="stageForm.stageName" type="text" placeholder="例如 开花坐果期" />
            </label>
            <label class="form-item">
              <span>阶段顺序</span>
              <input v-model="stageForm.stageOrder" type="number" min="1" />
            </label>
            <label class="form-item">
              <span>状态</span>
              <select v-model="stageForm.enabled">
                <option :value="true">启用</option>
                <option :value="false">停用</option>
              </select>
            </label>
            <label class="form-item form-span">
              <span>备注</span>
              <textarea v-model="stageForm.remark" rows="2"></textarea>
            </label>
          </form>

          <table class="simple-table">
            <thead>
              <tr>
                <th>品类</th>
                <th>编码</th>
                <th>阶段名称</th>
                <th>顺序</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in stages" :key="item.id">
                <td>{{ item.speciesName }}</td>
                <td>{{ item.stageCode }}</td>
                <td>{{ item.stageName }}</td>
                <td>{{ item.stageOrder }}</td>
                <td><span class="tag" :class="item.status === 'enabled' ? 'tag-success' : 'tag-warning'">{{ item.status === "enabled" ? "启用" : "停用" }}</span></td>
                <td>
                  <div class="table-actions">
                    <button class="table-link" @click="editStage(item)">编辑</button>
                    <button class="table-link" @click="removeStage(item)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="detail-card">
          <div class="panel-header">
            <h3>推荐目标</h3>
            <div class="inline-actions">
              <button class="ghost-button" @click="resetTargetForm">清空</button>
              <button class="primary-button" @click="saveTarget" :disabled="savingTarget">
                {{ savingTarget ? "保存中..." : targetForm.id ? "保存目标" : "新增目标" }}
              </button>
            </div>
          </div>

          <form class="form-grid" @submit.prevent="saveTarget">
            <label class="form-item">
              <span>作物品类</span>
              <select v-model="targetForm.speciesId" @change="handleTargetSpeciesChange">
                <option value="">请选择</option>
                <option v-for="item in species" :key="item.id" :value="String(item.id)">{{ item.speciesName }}</option>
              </select>
            </label>
            <label class="form-item">
              <span>作物品种</span>
              <select v-model="targetForm.varietyId">
                <option value="">通用品种目标</option>
                <option v-for="item in targetVarietyOptions" :key="item.id" :value="String(item.id)">{{ item.varietyName }}</option>
              </select>
            </label>
            <label class="form-item">
              <span>生长阶段</span>
              <select v-model="targetForm.stageId">
                <option value="">请选择</option>
                <option v-for="item in targetStageOptions" :key="item.id" :value="String(item.id)">{{ item.stageName }}</option>
              </select>
            </label>
            <label class="form-item">
              <span>指标</span>
              <select v-model="targetForm.metricCode">
                <option value="">请选择</option>
                <option v-for="item in metricOptions" :key="item.metricCode" :value="item.metricCode">
                  {{ item.metricName }} / {{ item.metricCode }}
                </option>
              </select>
            </label>
            <label class="form-item">
              <span>推荐下限</span>
              <input v-model="targetForm.targetMin" type="number" step="0.01" />
            </label>
            <label class="form-item">
              <span>推荐上限</span>
              <input v-model="targetForm.targetMax" type="number" step="0.01" />
            </label>
            <label class="form-item">
              <span>最佳值</span>
              <input v-model="targetForm.optimalValue" type="number" step="0.01" />
            </label>
            <label class="form-item">
              <span>排序</span>
              <input v-model="targetForm.sortOrder" type="number" min="1" />
            </label>
            <label class="form-item">
              <span>来源</span>
              <input v-model="targetForm.sourceName" type="text" placeholder="例如 平台内置示例知识库" />
            </label>
            <label class="form-item">
              <span>状态</span>
              <select v-model="targetForm.enabled">
                <option :value="true">启用</option>
                <option :value="false">停用</option>
              </select>
            </label>
            <label class="form-item form-span">
              <span>容差说明</span>
              <input v-model="targetForm.toleranceText" type="text" placeholder="例如 白天建议 22-28℃，夜间不低于 15℃" />
            </label>
            <label class="form-item form-span">
              <span>建议说明</span>
              <textarea v-model="targetForm.advisoryText" rows="2" placeholder="例如 温度偏低会影响坐果，偏高会影响花粉活性"></textarea>
            </label>
          </form>

          <table class="simple-table">
            <thead>
              <tr>
                <th>作物 / 品种 / 阶段</th>
                <th>指标</th>
                <th>目标区间</th>
                <th>最佳值</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in targets" :key="item.id">
                <td>
                  <div>{{ item.speciesName }}</div>
                  <div class="muted-text">{{ item.varietyName || "通用品种" }} / {{ item.stageName }}</div>
                </td>
                <td>{{ item.metricName || item.metricCode }}</td>
                <td>{{ formatTargetRange(item) }}</td>
                <td>{{ formatOptimalValue(item) }}</td>
                <td><span class="tag" :class="item.status === 'enabled' ? 'tag-success' : 'tag-warning'">{{ item.status === "enabled" ? "启用" : "停用" }}</span></td>
                <td>
                  <div class="table-actions">
                    <button class="table-link" @click="editTarget(item)">编辑</button>
                    <button class="table-link" @click="removeTarget(item)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { apiRequest } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { hasPermission } from "../lib/session";

const canManage = hasPermission("system:config");
const route = useRoute();

const loading = ref(false);
const recommendationLoading = ref(false);
const snapshotsLoading = ref(false);
const snapshotSaving = ref(false);
const savingSpecies = ref(false);
const savingVariety = ref(false);
const savingStage = ref(false);
const savingTarget = ref(false);
const message = ref("");
const errorMessage = ref("");
const recommendationError = ref("");
const snapshotError = ref("");

const species = ref([]);
const varieties = ref([]);
const stages = ref([]);
const targets = ref([]);
const metricOptions = ref([]);
const areaOptions = ref([]);
const recommendationSnapshots = ref([]);
const selectedAreaId = ref("");
const recommendation = reactive({
  status: "",
  summary: "",
  metrics: [],
  area: null,
  weather: null
});

const speciesForm = reactive(createSpeciesForm());
const varietyForm = reactive(createVarietyForm());
const stageForm = reactive(createStageForm());
const targetForm = reactive(createTargetForm());

const selectedArea = computed(() =>
  areaOptions.value.find((item) => String(item.id) === String(selectedAreaId.value)) || null
);

const configuredAreaCount = computed(() =>
  areaOptions.value.filter((item) => item.cropSpeciesId && item.cropStageId).length
);

const enabledTargetCount = computed(() =>
  targets.value.filter((item) => item.status === "enabled").length
);

const targetVarietyOptions = computed(() =>
  varieties.value.filter((item) => String(item.speciesId) === String(targetForm.speciesId))
);

const targetStageOptions = computed(() =>
  stages.value.filter((item) => String(item.speciesId) === String(targetForm.speciesId))
);
const cropDecisionCards = computed(() => CROP_DECISION_CATEGORIES.map((category) => buildDecisionCard(category)));
const cropDecisionPriorityCard = computed(() => {
  const priorityOrder = ["high", "low", "missing", "unconfigured", "within"];
  return [...cropDecisionCards.value].sort((a, b) => priorityOrder.indexOf(a.status) - priorityOrder.indexOf(b.status))[0] || null;
});
const cropDecisionPriorityLabel = computed(() => {
  const status = cropDecisionPriorityCard.value?.status;
  if (status === "high" || status === "low") {
    return "需要处理";
  }
  if (status === "missing") {
    return "待接入";
  }
  if (status === "unconfigured") {
    return "待配置";
  }
  return "平稳";
});
const cropDecisionPriorityClass = computed(() => decisionStatusClass(cropDecisionPriorityCard.value?.status || "within"));
const cropDecisionPriorityText = computed(() => {
  const card = cropDecisionPriorityCard.value;
  if (!selectedAreaId.value) {
    return "请选择区域后生成规则型建议。";
  }
  if (!card) {
    return "当前没有可用的决策卡。";
  }
  if (card.status === "within") {
    return "当前关键指标整体平稳，保持现有管理策略。";
  }
  return `${card.title}：${card.actionText}`;
});
const cropDecisionReport = computed(() => buildCropDecisionReport());

const CROP_DECISION_CATEGORIES = [
  {
    key: "temperature",
    title: "温度",
    subtitle: "影响生长速度、开花坐果和病害风险",
    keywords: ["temperature", "air_temperature", "ambient_temperature", "temp", "温度", "气温"],
    actions: {
      low: "温度偏低，建议检查保温、棚膜和夜间加温策略。",
      high: "温度偏高，建议通风、遮阴或增加降温措施。",
      within: "温度处于建议范围，保持当前通风和保温策略。",
      missing: "未接入温度数据，建议补充空气温度传感器。"
    }
  },
  {
    key: "air_humidity",
    title: "空气湿度",
    subtitle: "影响蒸腾、病害和棚内舒适区间",
    keywords: ["air_humidity", "relative_humidity", "humidity", "空气湿度", "相对湿度"],
    actions: {
      low: "空气湿度偏低，建议适度喷雾或降低通风强度。",
      high: "空气湿度偏高，建议加强通风除湿，降低病害风险。",
      within: "空气湿度处于建议范围，保持当前通风节奏。",
      missing: "未接入空气湿度数据，建议补充空气湿度传感器。"
    }
  },
  {
    key: "soil_moisture",
    title: "土壤湿度",
    subtitle: "决定灌溉节奏和根系水分环境",
    keywords: ["soil_moisture", "soil_humidity", "soil_water", "moisture", "土壤湿度", "土壤含水"],
    actions: {
      low: "土壤湿度偏低，建议安排灌溉或检查滴灌出水。",
      high: "土壤湿度偏高，建议暂停灌溉并检查排水。",
      within: "土壤湿度处于建议范围，维持当前灌溉频率。",
      missing: "未接入土壤湿度数据，灌溉建议可信度会下降。"
    }
  },
  {
    key: "light",
    title: "光照",
    subtitle: "影响光合作用、徒长和产量形成",
    keywords: ["light", "illumination", "lux", "par", "光照", "照度"],
    actions: {
      low: "光照偏低，建议检查遮挡、补光或棚膜透光情况。",
      high: "光照偏高，建议关注叶片灼伤风险，必要时遮阴。",
      within: "光照处于建议范围，保持当前遮阴和补光策略。",
      missing: "未接入光照数据，建议补充照度或 PAR 传感器。"
    }
  },
  {
    key: "irrigation",
    title: "灌溉建议",
    subtitle: "优先根据土壤湿度给出补水或停灌建议",
    type: "irrigation",
    keywords: []
  }
];

function buildDecisionCard(category) {
  if (category.type === "irrigation") {
    return buildIrrigationDecisionCard(category);
  }

  const metric = findDecisionMetric(category);
  if (!metric) {
    return {
      key: category.key,
      title: category.title,
      subtitle: category.subtitle,
      status: "unconfigured",
      statusLabel: "未配置",
      currentText: "-",
      targetText: "未配置目标",
      actionText: `请在推荐目标中维护${category.title}区间，后续才能生成稳定建议。`
    };
  }

  const status = metric.deviationStatus || "missing";
  return {
    key: category.key,
    title: category.title,
    subtitle: category.subtitle,
    status,
    statusLabel: decisionStatusLabel(status),
    currentText: formatMetricCurrentValue(metric),
    targetText: formatTargetRange(metric),
    actionText: category.actions?.[status] || metric.advisoryText || metric.toleranceText || "按当前目标区间继续观察。"
  };
}

function buildIrrigationDecisionCard(category) {
  const soilMetric = findDecisionMetric(CROP_DECISION_CATEGORIES.find((item) => item.key === "soil_moisture"));
  if (!soilMetric) {
    return {
      key: category.key,
      title: category.title,
      subtitle: category.subtitle,
      status: "unconfigured",
      statusLabel: "待配置",
      currentText: "-",
      targetText: "依赖土壤湿度",
      actionText: "请先配置并接入土壤湿度目标，灌溉建议会以此作为主要依据。"
    };
  }

  if (soilMetric.deviationStatus === "low") {
    return {
      key: category.key,
      title: category.title,
      subtitle: category.subtitle,
      status: "low",
      statusLabel: "建议灌溉",
      currentText: formatMetricCurrentValue(soilMetric),
      targetText: formatTargetRange(soilMetric),
      actionText: "土壤湿度低于建议下限，建议安排灌溉；执行前确认水泵和阀门状态。"
    };
  }

  if (soilMetric.deviationStatus === "high") {
    return {
      key: category.key,
      title: category.title,
      subtitle: category.subtitle,
      status: "high",
      statusLabel: "暂停灌溉",
      currentText: formatMetricCurrentValue(soilMetric),
      targetText: formatTargetRange(soilMetric),
      actionText: "土壤湿度高于建议上限，建议暂停灌溉并观察排水情况。"
    };
  }

  if (soilMetric.deviationStatus === "missing") {
    return {
      key: category.key,
      title: category.title,
      subtitle: category.subtitle,
      status: "missing",
      statusLabel: "待接入",
      currentText: "未接入",
      targetText: formatTargetRange(soilMetric),
      actionText: "土壤湿度暂无实时值，暂不建议自动灌溉，先人工确认墒情。"
    };
  }

  return {
    key: category.key,
    title: category.title,
    subtitle: category.subtitle,
    status: "within",
    statusLabel: "保持",
    currentText: formatMetricCurrentValue(soilMetric),
    targetText: formatTargetRange(soilMetric),
    actionText: "土壤湿度处于建议范围，维持当前灌溉策略。"
  };
}

function findDecisionMetric(category) {
  if (!category) {
    return null;
  }
  return recommendation.metrics.find((item) => {
    const text = `${item.metricCode || ""} ${item.metricName || ""}`.toLowerCase();
    return category.keywords.some((keyword) => text.includes(String(keyword).toLowerCase()));
  }) || null;
}

function decisionStatusClass(status) {
  if (status === "within") {
    return "tag-success";
  }
  if (status === "missing" || status === "unconfigured") {
    return "tag-warning";
  }
  return "tag-danger";
}

function decisionStatusLabel(status) {
  if (status === "within") {
    return "正常";
  }
  if (status === "low") {
    return "偏低";
  }
  if (status === "high") {
    return "偏高";
  }
  if (status === "unconfigured") {
    return "未配置";
  }
  return "未接入";
}

function buildCropDecisionReport() {
  const weather = recommendation.weather || {};
  const currentWeather = weather.current || null;
  const weatherAction = buildWeatherAction(currentWeather, weather);
  const attentionCards = cropDecisionCards.value
    .filter((item) => ["high", "low", "missing"].includes(item.status))
    .slice(0, 3);
  const primaryActions = attentionCards.map((card) => ({
    key: card.key,
    label: card.statusLabel,
    className: decisionStatusClass(card.status),
    title: card.title,
    text: card.actionText
  }));
  const actions = [
    ...primaryActions,
    weatherAction
  ].filter(Boolean).slice(0, 4);
  const issueCount = cropDecisionCards.value.filter((item) => ["high", "low"].includes(item.status)).length;
  const missingCount = cropDecisionCards.value.filter((item) => item.status === "missing").length;
  const realtimeMetricCount = recommendation.metrics.filter((item) => item.currentValue !== null && item.currentValue !== undefined && item.currentValue !== "").length;
  const cropText = selectedArea.value ? formatAreaCrop(selectedArea.value) : "未选择区域";
  const stageText = selectedArea.value?.cropStageName || selectedArea.value?.growthStage || "未绑定生长阶段";
  const weatherTitle = formatWeatherTitle(weather);

  let levelLabel = "平稳";
  let levelClass = "tag-success";
  let title = "当前可按常规策略管理";
  let summary = "作物目标、实时监测和天气上下文暂无明显冲突，建议保持当前管理节奏。";

  if (!selectedAreaId.value) {
    levelLabel = "待选择";
    levelClass = "tag-warning";
    title = "请选择区域生成建议报告";
    summary = "选择区域后，系统会把作物阶段、实时监测值和天气上下文合并成规则型建议。";
  } else if (issueCount > 0) {
    levelLabel = "需处理";
    levelClass = "tag-danger";
    title = `当前有 ${issueCount} 项关键指标偏离目标`;
    summary = `建议优先处理 ${attentionCards.map((item) => item.title).join("、")}，再结合天气判断是否需要调整通风、灌溉或遮阴。`;
  } else if (missingCount > 0) {
    levelLabel = "待补数";
    levelClass = "tag-warning";
    title = `当前有 ${missingCount} 项关键指标缺少实时值`;
    summary = "建议先补齐传感器接入或确认设备上报，再把报告用于自动化决策。";
  }

  return {
    levelLabel,
    levelClass,
    title,
    summary,
    cropText,
    stageText,
    weatherTitle,
    weatherSummary: weather.summary || "天气上下文暂不可用，报告先按作物知识库和实时传感器判断。",
    realtimeTitle: realtimeMetricCount > 0 ? `${realtimeMetricCount} 项实时值` : "暂无实时值",
    realtimeSummary: realtimeMetricCount > 0 ? "已接入实时监测，可直接判断当前值与目标区间偏差。" : "当前指标缺少实时值，建议先补齐传感器或检查上报链路。",
    realtimeMetricCount,
    weatherEvidence: weatherTitle === "天气未接入" ? "天气未接入" : `天气：${weatherTitle}`,
    actions: actions.length > 0
      ? actions
      : [
          {
            key: "steady",
            label: "保持",
            className: "tag-success",
            title: "维持当前管理",
            text: "继续观察实时数据和天气变化，暂不建议调整灌溉、通风或遮阴策略。"
          }
        ]
  };
}

function buildWeatherAction(currentWeather, weather) {
  if (!weather || !currentWeather) {
    return {
      key: "weather_missing",
      label: "天气",
      className: "tag-warning",
      title: "补充天气上下文",
      text: weather?.summary || "天气服务暂无实时数据，建议在区域中配置定位名称或经纬度。"
    };
  }

  if (Number(currentWeather.temperature) >= 32) {
    return {
      key: "weather_hot",
      label: "高温",
      className: "tag-warning",
      title: "关注外部高温",
      text: "外部温度较高，若棚内温度也偏高，优先通风、遮阴和降温；灌溉前确认土壤湿度。"
    };
  }
  if (Number(currentWeather.temperature) <= 8) {
    return {
      key: "weather_cold",
      label: "低温",
      className: "tag-warning",
      title: "关注低温保温",
      text: "外部温度较低，建议检查夜间保温、棚膜密闭和低温对当前生长阶段的影响。"
    };
  }
  if (Number(currentWeather.relativeHumidity) >= 85) {
    return {
      key: "weather_humid",
      label: "高湿",
      className: "tag-warning",
      title: "关注高湿病害风险",
      text: "外部湿度偏高，棚内若也高湿，建议加强通风除湿，谨慎喷雾和灌溉。"
    };
  }
  if (Number(currentWeather.precipitation) > 0) {
    return {
      key: "weather_rain",
      label: "降水",
      className: "tag-warning",
      title: "关注降水影响",
      text: "当前有降水记录，露地或半开放区域建议结合土壤湿度再决定是否灌溉。"
    };
  }

  return {
    key: "weather_ok",
    label: "天气",
    className: "tag-success",
    title: "天气暂无明显冲突",
    text: "当前天气未触发高温、低温、高湿或降水提示，可按作物目标区间继续管理。"
  };
}

function formatWeatherTitle(weather) {
  const currentWeather = weather?.current;
  if (!currentWeather) {
    return "天气未接入";
  }
  const segments = [];
  if (currentWeather.temperature !== null && currentWeather.temperature !== undefined) {
    segments.push(`${formatWeatherNumber(currentWeather.temperature, 1)}${currentWeather.temperatureUnit || "℃"}`);
  }
  if (currentWeather.weatherLabel) {
    segments.push(currentWeather.weatherLabel);
  }
  return segments.join(" · ") || "已接入天气";
}

function formatWeatherNumber(value, precision = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  return numeric.toFixed(precision).replace(/\.0$/, "");
}

function createSpeciesForm() {
  return {
    id: null,
    speciesCode: "",
    speciesName: "",
    categoryName: "",
    scientificName: "",
    sortOrder: 100,
    enabled: true,
    remark: ""
  };
}

function createVarietyForm() {
  return {
    id: null,
    speciesId: "",
    varietyCode: "",
    varietyName: "",
    sortOrder: 100,
    enabled: true,
    remark: ""
  };
}

function createStageForm() {
  return {
    id: null,
    speciesId: "",
    stageCode: "",
    stageName: "",
    stageOrder: 10,
    enabled: true,
    remark: ""
  };
}

function createTargetForm() {
  return {
    id: null,
    speciesId: "",
    varietyId: "",
    stageId: "",
    metricCode: "",
    targetMin: "",
    targetMax: "",
    optimalValue: "",
    toleranceText: "",
    advisoryText: "",
    sourceName: "平台内置示例知识库",
    sortOrder: 100,
    enabled: true
  };
}

function assignForm(target, source) {
  Object.keys(target).forEach((key) => {
    target[key] = source[key];
  });
}

function resetSpeciesForm() {
  assignForm(speciesForm, createSpeciesForm());
}

function resetVarietyForm() {
  assignForm(varietyForm, createVarietyForm());
}

function resetStageForm() {
  assignForm(stageForm, createStageForm());
}

function resetTargetForm() {
  assignForm(targetForm, createTargetForm());
}

function handleTargetSpeciesChange() {
  if (!targetVarietyOptions.value.some((item) => String(item.id) === String(targetForm.varietyId))) {
    targetForm.varietyId = "";
  }
  if (!targetStageOptions.value.some((item) => String(item.id) === String(targetForm.stageId))) {
    targetForm.stageId = "";
  }
}

function formatAreaCrop(area) {
  if (!area) {
    return "-";
  }
  return [area.cropSpeciesName, area.cropVarietyName].filter(Boolean).join(" / ") || area.cropType || "未绑定";
}

function formatTargetRange(item) {
  const unit = item.unitName ? ` ${item.unitName}` : "";
  if (item.targetMin !== null && item.targetMax !== null) {
    return `${item.targetMin} - ${item.targetMax}${unit}`;
  }
  if (item.targetMin !== null) {
    return `>= ${item.targetMin}${unit}`;
  }
  if (item.targetMax !== null) {
    return `<= ${item.targetMax}${unit}`;
  }
  return "-";
}

function formatOptimalValue(item) {
  if (item.optimalValue === null || item.optimalValue === undefined || item.optimalValue === "") {
    return "-";
  }
  return `${item.optimalValue}${item.unitName ? ` ${item.unitName}` : ""}`;
}

function formatMetricCurrentValue(item) {
  if (item.currentValue === null || item.currentValue === undefined || item.currentValue === "") {
    return "未接入";
  }
  return `${item.currentValue}${item.unitName ? ` ${item.unitName}` : ""}`;
}

function recommendationStatusClass(status) {
  if (status === "ready") {
    return "tag-success";
  }
  if (status === "unconfigured" || status === "no_targets") {
    return "tag-warning";
  }
  return "tag-danger";
}

function recommendationStatusLabel(status) {
  if (status === "ready") {
    return "已生成";
  }
  if (status === "unconfigured") {
    return "未绑定";
  }
  if (status === "no_targets") {
    return "未配置目标";
  }
  return "异常";
}

function recommendationMetricClass(status) {
  if (status === "within") {
    return "tag-success";
  }
  if (status === "missing") {
    return "tag-warning";
  }
  return "tag-danger";
}

function recommendationMetricLabel(status) {
  if (status === "within") {
    return "正常";
  }
  if (status === "low") {
    return "偏低";
  }
  if (status === "high") {
    return "偏高";
  }
  return "未接入";
}

function snapshotLevelClass(level) {
  if (level === "stable") {
    return "tag-success";
  }
  if (level === "needs_action") {
    return "tag-danger";
  }
  return "tag-warning";
}

function snapshotLevelLabel(level) {
  if (level === "stable") {
    return "平稳";
  }
  if (level === "needs_action") {
    return "需处理";
  }
  if (level === "data_gap") {
    return "待补数";
  }
  if (level === "unconfigured") {
    return "待绑定";
  }
  if (level === "no_targets") {
    return "待配置";
  }
  return "快照";
}

function snapshotWeatherStatusLabel(status) {
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
  if (status === "provider_error") {
    return "异常";
  }
  return "-";
}

async function loadAreaOptions() {
  areaOptions.value = await apiRequest("/api/v1/crop-knowledge/area-options");
  const routeAreaId = firstQueryValue(route.query.areaId) || "";
  const hasRouteArea = areaOptions.value.some((item) => String(item.id) === String(routeAreaId));
  if (hasRouteArea) {
    selectedAreaId.value = String(routeAreaId);
    return;
  }
  if (!selectedAreaId.value && areaOptions.value[0]) {
    selectedAreaId.value = String(areaOptions.value[0].id);
  }
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadKnowledge() {
  const [speciesRows, varietyRows, stageRows, targetRows] = await Promise.all([
    apiRequest("/api/v1/crop-knowledge/species"),
    apiRequest("/api/v1/crop-knowledge/varieties"),
    apiRequest("/api/v1/crop-knowledge/stages"),
    apiRequest("/api/v1/crop-knowledge/targets")
  ]);
  species.value = speciesRows;
  varieties.value = varietyRows;
  stages.value = stageRows;
  targets.value = targetRows;
}

async function loadMetrics() {
  metricOptions.value = await apiRequest("/api/v1/metrics?enabled=true");
}

async function loadRecommendation() {
	  if (!selectedAreaId.value) {
	    recommendation.status = "";
	    recommendation.summary = "";
	    recommendation.metrics = [];
	    recommendation.area = null;
	    recommendation.weather = null;
	    recommendationSnapshots.value = [];
	    return;
	  }

  recommendationLoading.value = true;
  recommendationError.value = "";
  try {
    const result = await apiRequest(`/api/v1/crop-knowledge/recommendation?areaId=${selectedAreaId.value}`);
    recommendation.status = result.status || "";
	    recommendation.summary = result.summary || "";
	    recommendation.metrics = Array.isArray(result.metrics) ? result.metrics : [];
	    recommendation.area = result.area || null;
	    recommendation.weather = result.weather || null;
	    await loadRecommendationSnapshots();
	  } catch (error) {
	    recommendationError.value = error.message;
	    recommendation.status = "error";
	    recommendation.summary = "";
	    recommendation.metrics = [];
	    recommendation.area = null;
	    recommendation.weather = null;
	    recommendationSnapshots.value = [];
	  } finally {
    recommendationLoading.value = false;
  }
}

async function loadRecommendationSnapshots() {
  if (!selectedAreaId.value) {
    recommendationSnapshots.value = [];
    return;
  }
  snapshotsLoading.value = true;
  snapshotError.value = "";
  try {
    const rows = await apiRequest(`/api/v1/crop-knowledge/recommendation-snapshots?areaId=${selectedAreaId.value}&limit=6`);
    recommendationSnapshots.value = Array.isArray(rows) ? rows : [];
  } catch (error) {
    snapshotError.value = error.message;
    recommendationSnapshots.value = [];
  } finally {
    snapshotsLoading.value = false;
  }
}

async function saveRecommendationSnapshot() {
  if (!selectedAreaId.value) {
    return;
  }
  snapshotSaving.value = true;
  snapshotError.value = "";
  message.value = "";
  try {
    await apiRequest("/api/v1/crop-knowledge/recommendation-snapshots", {
      method: "POST",
      body: JSON.stringify({
        areaId: selectedAreaId.value
      })
    });
    message.value = "作物建议快照已保存";
    await loadRecommendationSnapshots();
  } catch (error) {
    snapshotError.value = error.message;
  } finally {
    snapshotSaving.value = false;
  }
}

async function reloadAll() {
  loading.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await Promise.all([loadAreaOptions(), loadKnowledge(), loadMetrics()]);
    await loadRecommendation();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function saveSpecies() {
  savingSpecies.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      speciesCode: speciesForm.speciesCode,
      speciesName: speciesForm.speciesName,
      categoryName: speciesForm.categoryName,
      scientificName: speciesForm.scientificName,
      sortOrder: Number(speciesForm.sortOrder) || 100,
      enabled: speciesForm.enabled,
      remark: speciesForm.remark
    };
    if (speciesForm.id) {
      await apiRequest(`/api/v1/crop-knowledge/species/${speciesForm.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "作物品类已更新";
    } else {
      await apiRequest("/api/v1/crop-knowledge/species", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "作物品类已创建";
    }
    resetSpeciesForm();
    await Promise.all([loadKnowledge(), loadAreaOptions()]);
    await loadRecommendation();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    savingSpecies.value = false;
  }
}

async function saveVariety() {
  savingVariety.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      speciesId: varietyForm.speciesId || null,
      varietyCode: varietyForm.varietyCode,
      varietyName: varietyForm.varietyName,
      sortOrder: Number(varietyForm.sortOrder) || 100,
      enabled: varietyForm.enabled,
      remark: varietyForm.remark
    };
    if (varietyForm.id) {
      await apiRequest(`/api/v1/crop-knowledge/varieties/${varietyForm.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "作物品种已更新";
    } else {
      await apiRequest("/api/v1/crop-knowledge/varieties", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "作物品种已创建";
    }
    resetVarietyForm();
    await Promise.all([loadKnowledge(), loadAreaOptions()]);
    await loadRecommendation();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    savingVariety.value = false;
  }
}

async function saveStage() {
  savingStage.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      speciesId: stageForm.speciesId || null,
      stageCode: stageForm.stageCode,
      stageName: stageForm.stageName,
      stageOrder: Number(stageForm.stageOrder) || 10,
      enabled: stageForm.enabled,
      remark: stageForm.remark
    };
    if (stageForm.id) {
      await apiRequest(`/api/v1/crop-knowledge/stages/${stageForm.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "生长阶段已更新";
    } else {
      await apiRequest("/api/v1/crop-knowledge/stages", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "生长阶段已创建";
    }
    resetStageForm();
    await Promise.all([loadKnowledge(), loadAreaOptions()]);
    await loadRecommendation();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    savingStage.value = false;
  }
}

async function saveTarget() {
  savingTarget.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      speciesId: targetForm.speciesId || null,
      varietyId: targetForm.varietyId || null,
      stageId: targetForm.stageId || null,
      metricCode: targetForm.metricCode,
      targetMin: targetForm.targetMin === "" ? null : Number(targetForm.targetMin),
      targetMax: targetForm.targetMax === "" ? null : Number(targetForm.targetMax),
      optimalValue: targetForm.optimalValue === "" ? null : Number(targetForm.optimalValue),
      toleranceText: targetForm.toleranceText,
      advisoryText: targetForm.advisoryText,
      sourceName: targetForm.sourceName,
      sortOrder: Number(targetForm.sortOrder) || 100,
      enabled: targetForm.enabled
    };
    if (targetForm.id) {
      await apiRequest(`/api/v1/crop-knowledge/targets/${targetForm.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "推荐目标已更新";
    } else {
      await apiRequest("/api/v1/crop-knowledge/targets", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "推荐目标已创建";
    }
    resetTargetForm();
    await loadKnowledge();
    await loadRecommendation();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    savingTarget.value = false;
  }
}

function editSpecies(item) {
  assignForm(speciesForm, {
    id: item.id,
    speciesCode: item.speciesCode,
    speciesName: item.speciesName,
    categoryName: item.categoryName || "",
    scientificName: item.scientificName || "",
    sortOrder: item.sortOrder || 100,
    enabled: item.status === "enabled",
    remark: item.remark || ""
  });
}

function editVariety(item) {
  assignForm(varietyForm, {
    id: item.id,
    speciesId: String(item.speciesId),
    varietyCode: item.varietyCode,
    varietyName: item.varietyName,
    sortOrder: item.sortOrder || 100,
    enabled: item.status === "enabled",
    remark: item.remark || ""
  });
}

function editStage(item) {
  assignForm(stageForm, {
    id: item.id,
    speciesId: String(item.speciesId),
    stageCode: item.stageCode,
    stageName: item.stageName,
    stageOrder: item.stageOrder || 10,
    enabled: item.status === "enabled",
    remark: item.remark || ""
  });
}

function editTarget(item) {
  assignForm(targetForm, {
    id: item.id,
    speciesId: String(item.speciesId),
    varietyId: item.varietyId ? String(item.varietyId) : "",
    stageId: String(item.stageId),
    metricCode: item.metricCode,
    targetMin: item.targetMin ?? "",
    targetMax: item.targetMax ?? "",
    optimalValue: item.optimalValue ?? "",
    toleranceText: item.toleranceText || "",
    advisoryText: item.advisoryText || "",
    sourceName: item.sourceName || "",
    sortOrder: item.sortOrder || 100,
    enabled: item.status === "enabled"
  });
}

async function removeSpecies(item) {
  if (!window.confirm(`确定删除作物品类“${item.speciesName}”吗？`)) {
    return;
  }
  await removeKnowledgeEntity(`/api/v1/crop-knowledge/species/${item.id}`, "作物品类已删除", loadKnowledge);
}

async function removeVariety(item) {
  if (!window.confirm(`确定删除作物品种“${item.varietyName}”吗？`)) {
    return;
  }
  await removeKnowledgeEntity(`/api/v1/crop-knowledge/varieties/${item.id}`, "作物品种已删除", loadKnowledge);
}

async function removeStage(item) {
  if (!window.confirm(`确定删除生长阶段“${item.stageName}”吗？`)) {
    return;
  }
  await removeKnowledgeEntity(`/api/v1/crop-knowledge/stages/${item.id}`, "生长阶段已删除", loadKnowledge);
}

async function removeTarget(item) {
  if (!window.confirm(`确定删除指标“${item.metricName || item.metricCode}”的推荐目标吗？`)) {
    return;
  }
  await removeKnowledgeEntity(`/api/v1/crop-knowledge/targets/${item.id}`, "推荐目标已删除", async () => {
    await loadKnowledge();
    await loadRecommendation();
  });
}

async function removeKnowledgeEntity(path, successMessage, callback) {
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(path, {
      method: "DELETE"
    });
    message.value = successMessage;
    await callback();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

onMounted(reloadAll);
</script>
