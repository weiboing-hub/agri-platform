<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>规则引擎</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadRules">刷新</button>
          <button v-if="canEdit" class="primary-button" @click="startCreate">新建规则</button>
        </div>
      </div>

      <div class="metric-strip actuator-summary-strip">
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ rules.length }}</div>
          <div class="stat-desc">当前规则</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ enabledRuleCount }}</div>
          <div class="stat-desc">已启用</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ visualRuleCount }}</div>
          <div class="stat-desc">可视化规则</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ highPriorityRuleCount }}</div>
          <div class="stat-desc">高优先级</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ autoRecoveryRuleCount }}</div>
          <div class="stat-desc">自动恢复</div>
        </article>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="规则编号 / 名称" />
        </label>
        <label class="filter-item">
          <span>规则类型</span>
          <select v-model="filters.ruleType">
            <option value="">全部</option>
            <option value="threshold">{{ enumLabel("ruleType", "threshold") }}</option>
            <option value="trend">{{ enumLabel("ruleType", "trend") }}</option>
            <option value="anomaly">{{ enumLabel("ruleType", "anomaly") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>编辑模式</span>
          <select v-model="filters.builderMode">
            <option value="">全部</option>
            <option value="visual">{{ enumLabel("builderMode", "visual") }}</option>
            <option value="advanced">{{ enumLabel("builderMode", "advanced") }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>启用状态</span>
          <select v-model="filters.enabled">
            <option value="">全部</option>
            <option value="true">{{ enumLabel("status", "enabled") }}</option>
            <option value="false">{{ enumLabel("status", "disabled") }}</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadRules">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table desktop-table-only">
        <thead>
          <tr>
            <th>规则编号</th>
            <th>规则名称</th>
            <th>类型</th>
            <th>目标</th>
            <th>条件摘要</th>
            <th>动作摘要</th>
            <th>恢复策略</th>
            <th>优先级</th>
            <th>启用</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in rules" :key="item.id">
            <td>{{ item.ruleCode }}</td>
            <td>{{ item.ruleName }}</td>
            <td>{{ enumLabel("ruleType", item.ruleType) }}</td>
            <td>{{ enumLabel("targetType", item.targetType) }}</td>
            <td>{{ ruleConditionSummaryForRow(item) }}</td>
            <td>{{ ruleActionSummaryForRow(item) }}</td>
            <td>{{ enumLabel("recoveryPolicy", item.recoveryPolicy) }}</td>
            <td>{{ item.priority }}</td>
            <td><span class="tag" :class="item.enabled ? 'tag-success' : 'tag-warning'">{{ item.enabled ? enumLabel("status", "enabled") : enumLabel("status", "disabled") }}</span></td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="loadRuleDetail(item.id)">详情</button>
                <button v-if="canEdit" class="table-link" @click="startEdit(item.id)">编辑</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && rules.length === 0">
            <td colspan="10" class="empty-cell">暂无规则数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && rules.length > 0" class="responsive-card-list tablet-card-list">
        <article
          v-for="item in rules"
          :key="item.id"
          class="responsive-entity-card"
          :class="{ active: selectedRule?.id === item.id || editingRuleId === item.id }"
        >
          <div class="responsive-card-head">
            <div class="table-primary-cell">
              <strong>{{ item.ruleName }}</strong>
              <span>{{ item.ruleCode }}</span>
            </div>
            <div class="responsive-card-tags">
              <span class="tag tag-p1">{{ enumLabel("ruleType", item.ruleType) }}</span>
              <span class="tag" :class="item.enabled ? 'tag-success' : 'tag-warning'">
                {{ item.enabled ? enumLabel("status", "enabled") : enumLabel("status", "disabled") }}
              </span>
            </div>
          </div>
          <div class="responsive-card-grid">
            <div class="responsive-card-field">
              <span>目标</span>
              <strong>{{ enumLabel("targetType", item.targetType) }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>恢复策略</span>
              <strong>{{ enumLabel("recoveryPolicy", item.recoveryPolicy) }}</strong>
            </div>
            <div class="responsive-card-field responsive-card-field-full">
              <span>条件摘要</span>
              <strong>{{ ruleConditionSummaryForRow(item) }}</strong>
            </div>
            <div class="responsive-card-field responsive-card-field-full">
              <span>动作摘要</span>
              <strong>{{ ruleActionSummaryForRow(item) }}</strong>
            </div>
          </div>
          <div class="responsive-card-actions">
            <button class="ghost-button" @click="loadRuleDetail(item.id)">详情</button>
            <button v-if="canEdit" class="ghost-button" @click="startEdit(item.id)">编辑</button>
          </div>
        </article>
      </div>
      <div v-if="!loading && rules.length === 0" class="empty-state tablet-card-empty">暂无规则数据</div>
      <div v-if="loading" class="muted-text">正在加载规则数据...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingRuleId ? "编辑规则" : "新建规则" }}</h2>
          <span class="tag tag-p1">可视化编辑器</span>
        </div>

        <div class="form-progress-banner">
          <div class="form-progress-copy">
            <small>规则构建进度</small>
            <strong>已完成 {{ completedRuleStageCount }}/{{ RULE_FORM_STAGES.length }} 个步骤</strong>
            <span>{{ ruleProgressSummary }}</span>
          </div>
          <div class="form-progress-visual">
            <div class="form-progress-track">
              <span class="form-progress-bar" :style="{ width: `${ruleStageProgressPercent}%` }" />
            </div>
            <strong>{{ ruleStageProgressPercent }}%</strong>
          </div>
        </div>

        <div class="chip-list form-stage-strip">
          <button
            v-for="stage in RULE_FORM_STAGES"
            :key="stage.code"
            type="button"
            class="chip chip-button form-stage-button"
            :class="{
              'form-stage-button-active': ruleFormStage === stage.code,
              'form-stage-button-complete': ruleStageStatus[stage.code]
            }"
            @click="scrollToRuleStage(stage.code)"
          >
            <span>{{ stage.label }}</span>
            <small>{{ ruleStageStatus[stage.code] ? "已完成" : "待补充" }}</small>
          </button>
        </div>

        <form class="stack" @submit.prevent="saveRule">
          <section
            id="rule-stage-base"
            class="form-stage-panel"
            :class="{ 'form-stage-panel-collapsed': ruleFormStage !== 'base' && ruleStageStatus.base }"
          >
            <div class="builder-section-head">
              <div>
                <h3>1. 基础信息</h3>
                <p>先定义规则台账、作用对象和编辑模式，让这条规则在系统里可识别、可追踪。</p>
              </div>
              <div class="inline-actions">
                <span class="chip chip-permission">{{ form.ruleCode || "未填写编号" }}</span>
                <button
                  v-if="ruleFormStage !== 'base' && ruleStageStatus.base"
                  type="button"
                  class="ghost-button"
                  @click="scrollToRuleStage('base')"
                >
                  展开
                </button>
              </div>
            </div>

            <div v-show="ruleFormStage === 'base' || !ruleStageStatus.base" class="form-stage-grid">
              <label class="form-item">
                <span>规则编号</span>
                <input v-model="form.ruleCode" type="text" :disabled="Boolean(editingRuleId)" />
              </label>
              <label class="form-item">
                <span>规则名称</span>
                <input v-model="form.ruleName" type="text" />
              </label>
              <label class="form-item">
                <span>规则类型</span>
                <select v-model="form.ruleType">
                  <option value="threshold">{{ enumLabel("ruleType", "threshold") }}</option>
                  <option value="trend">{{ enumLabel("ruleType", "trend") }}</option>
                  <option value="anomaly">{{ enumLabel("ruleType", "anomaly") }}</option>
                </select>
              </label>
              <label class="form-item">
                <span>目标类型</span>
                <select v-model="form.targetType">
                  <option value="sensor">{{ enumLabel("targetType", "sensor") }}</option>
                  <option value="actuator">{{ enumLabel("targetType", "actuator") }}</option>
                  <option value="area">{{ enumLabel("targetType", "area") }}</option>
                </select>
              </label>
              <label class="form-item">
                <span>编辑模式</span>
                <select v-model="form.builderMode">
                  <option value="visual">{{ enumLabel("builderMode", "visual") }}</option>
                  <option value="advanced">{{ enumLabel("builderMode", "advanced") }}</option>
                </select>
              </label>
              <label class="form-item">
                <span>启用</span>
                <select v-model="form.enabled">
                  <option :value="true">{{ enumLabel("status", "enabled") }}</option>
                  <option :value="false">{{ enumLabel("status", "disabled") }}</option>
                </select>
              </label>
            </div>
          </section>

          <section
            id="rule-stage-policy"
            class="form-stage-panel"
            :class="{ 'form-stage-panel-collapsed': ruleFormStage !== 'policy' && ruleStageStatus.policy }"
          >
            <div class="builder-section-head">
              <div>
                <h3>2. 执行策略</h3>
                <p>这里定义恢复节奏、冷却时间、每日上限和优先级，避免规则互相打架。</p>
              </div>
              <div class="inline-actions">
                <span class="chip chip-action">优先级 {{ form.priority }}</span>
                <button
                  v-if="ruleFormStage !== 'policy' && ruleStageStatus.policy"
                  type="button"
                  class="ghost-button"
                  @click="scrollToRuleStage('policy')"
                >
                  展开
                </button>
              </div>
            </div>

            <div v-show="ruleFormStage === 'policy' || !ruleStageStatus.policy" class="form-stage-grid">
              <label class="form-item">
                <span>恢复策略</span>
                <select v-model="form.recoveryPolicy">
                  <option value="manual_close">{{ enumLabel("recoveryPolicy", "manual_close") }}</option>
                  <option value="auto_close">{{ enumLabel("recoveryPolicy", "auto_close") }}</option>
                  <option value="auto_downgrade">{{ enumLabel("recoveryPolicy", "auto_downgrade") }}</option>
                </select>
              </label>
              <label class="form-item">
                <span>恢复稳定秒数</span>
                <input v-model="form.recoveryStableSeconds" type="number" min="0" />
              </label>
              <label class="form-item">
                <span>冷却秒数</span>
                <input v-model="form.cooldownSeconds" type="number" min="0" />
              </label>
              <label class="form-item">
                <span>每日最大执行次数</span>
                <input v-model="form.dailyMaxExecutions" type="number" min="0" />
              </label>
              <label class="form-item">
                <span>优先级</span>
                <input v-model="form.priority" type="number" min="1" />
              </label>
            </div>
          </section>

          <section
            id="rule-stage-builder"
            class="form-stage-panel"
            :class="{ 'form-stage-panel-collapsed': ruleFormStage !== 'builder' && ruleStageStatus.builder }"
          >
            <div class="builder-section-head">
              <div>
                <h3>3. 触发条件与联动动作</h3>
                <p>最后把作用目标、触发条件和联动动作串起来，形成真正生效的规则闭环。</p>
              </div>
              <div class="inline-actions">
                <span class="chip">{{ form.builderMode === "visual" ? "可视化模式" : "高级模式" }}</span>
                <button
                  v-if="ruleFormStage !== 'builder' && ruleStageStatus.builder"
                  type="button"
                  class="ghost-button"
                  @click="scrollToRuleStage('builder')"
                >
                  展开
                </button>
              </div>
            </div>

            <div v-show="ruleFormStage === 'builder' || !ruleStageStatus.builder">
            <div v-if="form.builderMode === 'visual'" class="visual-builder">
            <div class="chip-list builder-stage-strip">
              <span class="chip chip-permission">1. 作用目标</span>
              <span class="chip chip-permission">2. 触发条件</span>
              <span class="chip chip-permission">3. 联动动作</span>
              <span class="chip">4. 原始预览</span>
            </div>

            <section class="builder-section">
              <div class="builder-section-head">
                <div>
                  <h3>作用目标</h3>
                  <p>先选规则作用对象，再勾选具体区域、传感器或执行器。</p>
                </div>
                <div class="inline-actions">
                  <span class="chip">{{ selectedTargetIds.length }} 个已选</span>
                  <button type="button" class="ghost-button" @click="selectedTargetIds = []">清空目标</button>
                </div>
              </div>

              <div class="builder-inline-grid">
                <label class="form-item">
                  <span>范围筛选区域</span>
                  <select v-model="targetFilterAreaId">
                    <option value="">全部区域</option>
                    <option v-for="area in areas" :key="area.id" :value="String(area.id)">
                      {{ area.areaName }}
                    </option>
                  </select>
                </label>
                <div class="builder-selected-targets">
                  <div class="detail-label">当前选中</div>
                  <div class="chip-list">
                    <span v-for="target in selectedTargetChips" :key="target.id" class="chip chip-permission">{{ target.label }}</span>
                    <span v-if="selectedTargetChips.length === 0" class="muted-text">未选择具体目标</span>
                  </div>
                </div>
              </div>

              <div class="target-grid">
                <label v-for="option in availableTargetOptions" :key="option.id" class="checkbox-card target-card">
                  <input type="checkbox" :checked="selectedTargetIds.includes(option.id)" @change="toggleTarget(option.id)" />
                  <div>
                    <div class="checkbox-title">{{ option.label }}</div>
                    <div class="checkbox-desc">{{ option.desc }}</div>
                  </div>
                </label>
                <div v-if="availableTargetOptions.length === 0" class="empty-state">当前类型下暂无可选目标。</div>
              </div>
            </section>

            <section class="builder-section">
              <div class="builder-section-head">
                <div>
                  <h3>触发条件</h3>
                  <p>条件字段全部来自指标字典；不同规则类型使用不同的可视化配置表单。</p>
                </div>
                <span class="chip chip-action">{{ visualConditionSummary }}</span>
              </div>

              <div class="builder-inline-grid">
                <label class="form-item">
                  <span>作用区域</span>
                  <select v-model="visualCondition.areaId">
                    <option value="">不限区域</option>
                    <option v-for="area in areas" :key="area.id" :value="String(area.id)">
                      {{ area.areaName }}
                    </option>
                  </select>
                </label>
                <label class="form-item">
                  <span>触发指标</span>
                  <select v-model="visualCondition.metric">
                    <option v-for="metric in metricOptions" :key="metric.metricCode" :value="metric.metricCode">
                      {{ formatMetricOption(metric) }}
                    </option>
                  </select>
                </label>
              </div>

              <div v-if="form.ruleType === 'threshold'" class="builder-inline-grid">
                <label class="form-item">
                  <span>比较运算符</span>
                  <select v-model="visualCondition.operator">
                    <option value="<">&lt;</option>
                    <option value="<=">&lt;=</option>
                    <option value=">">&gt;</option>
                    <option value=">=">&gt;=</option>
                  </select>
                </label>
                <label class="form-item">
                  <span>阈值</span>
                  <input v-model="visualCondition.threshold" type="number" step="0.1" />
                </label>
                <label class="form-item">
                  <span>持续判断秒数</span>
                  <input v-model="visualCondition.stableSeconds" type="number" min="0" />
                </label>
                <label class="form-item">
                  <span>聚合方式</span>
                  <select v-model="visualCondition.aggregation">
                    <option value="latest">最新值</option>
                    <option value="avg">平均值</option>
                    <option value="max">最大值</option>
                    <option value="min">最小值</option>
                  </select>
                </label>
                <label class="form-item">
                  <span>联动第二条件</span>
                  <select v-model="visualCondition.secondaryEnabled">
                    <option :value="false">关闭</option>
                    <option :value="true">开启</option>
                  </select>
                </label>
                <label v-if="visualCondition.secondaryEnabled" class="form-item">
                  <span>第二条件指标</span>
                  <select v-model="visualCondition.secondaryMetric">
                    <option v-for="metric in metricOptions" :key="`visual-secondary-${metric.metricCode}`" :value="metric.metricCode">
                      {{ formatMetricOption(metric) }}
                    </option>
                  </select>
                </label>
                <label v-if="visualCondition.secondaryEnabled" class="form-item">
                  <span>第二条件运算符</span>
                  <select v-model="visualCondition.secondaryOperator">
                    <option value="<">&lt;</option>
                    <option value="<=">&lt;=</option>
                    <option value=">">&gt;</option>
                    <option value=">=">&gt;=</option>
                  </select>
                </label>
                <label v-if="visualCondition.secondaryEnabled" class="form-item">
                  <span>第二条件阈值</span>
                  <input v-model="visualCondition.secondaryThreshold" type="number" step="0.1" />
                </label>
                <label v-if="visualCondition.secondaryEnabled" class="form-item">
                  <span>第二条件持续秒数</span>
                  <input v-model="visualCondition.secondaryStableSeconds" type="number" min="0" />
                </label>
                <label class="form-item">
                  <span>数据保护</span>
                  <select v-model="visualCondition.guardEnabled">
                    <option :value="false">关闭</option>
                    <option :value="true">开启</option>
                  </select>
                </label>
                <label v-if="visualCondition.guardEnabled" class="form-item">
                  <span>最小有效值</span>
                  <input v-model="visualCondition.guardMinValid" type="number" step="0.1" />
                </label>
                <label v-if="visualCondition.guardEnabled" class="form-item">
                  <span>最大有效值</span>
                  <input v-model="visualCondition.guardMaxValid" type="number" step="0.1" />
                </label>
                <label v-if="visualCondition.guardEnabled" class="form-item">
                  <span>最近正样本最少数</span>
                  <input v-model="visualCondition.guardMinRecentPositiveCount" type="number" min="0" />
                </label>
                <label v-if="visualCondition.guardEnabled" class="form-item">
                  <span>正样本统计秒数</span>
                  <input v-model="visualCondition.guardRecentPositiveWindowSeconds" type="number" min="0" />
                </label>
                <label v-if="visualCondition.guardEnabled" class="form-item">
                  <span>正样本阈值</span>
                  <input v-model="visualCondition.guardRecentPositiveThreshold" type="number" step="0.1" />
                </label>
                <label v-if="visualCondition.guardEnabled" class="form-item">
                  <span>异常样本触发数</span>
                  <input v-model="visualCondition.guardInvalidSampleCount" type="number" min="0" />
                </label>
                <label v-if="visualCondition.guardEnabled" class="form-item">
                  <span>异常样本统计秒数</span>
                  <input v-model="visualCondition.guardInvalidWindowSeconds" type="number" min="0" />
                </label>
                <label v-if="visualCondition.guardEnabled" class="form-item">
                  <span>保护告警</span>
                  <select v-model="visualCondition.guardCreateAlert">
                    <option :value="true">开启</option>
                    <option :value="false">关闭</option>
                  </select>
                </label>
                <label v-if="visualCondition.guardEnabled && visualCondition.guardCreateAlert" class="form-item">
                  <span>保护告警级别</span>
                  <select v-model="visualCondition.guardAlertSeverity">
                    <option value="critical">{{ enumLabel("severity", "critical") }}</option>
                    <option value="high">{{ enumLabel("severity", "high") }}</option>
                    <option value="medium">{{ enumLabel("severity", "medium") }}</option>
                    <option value="low">{{ enumLabel("severity", "low") }}</option>
                  </select>
                </label>
              </div>

              <div v-else-if="form.ruleType === 'trend'" class="builder-inline-grid">
                <label class="form-item">
                  <span>趋势方向</span>
                  <select v-model="visualCondition.direction">
                    <option value="rise">持续上升</option>
                    <option value="drop">持续下降</option>
                  </select>
                </label>
                <label class="form-item">
                  <span>变化阈值</span>
                  <input v-model="visualCondition.changeThreshold" type="number" step="0.1" />
                </label>
                <label class="form-item">
                  <span>统计窗口(分钟)</span>
                  <input v-model="visualCondition.windowMinutes" type="number" min="1" />
                </label>
                <label class="form-item">
                  <span>持续判断秒数</span>
                  <input v-model="visualCondition.stableSeconds" type="number" min="0" />
                </label>
                <label class="form-item">
                  <span>聚合方式</span>
                  <select v-model="visualCondition.aggregation">
                    <option value="avg">平均值</option>
                    <option value="latest">最新值</option>
                    <option value="max">最大值</option>
                    <option value="min">最小值</option>
                  </select>
                </label>
              </div>

              <div v-else class="builder-inline-grid">
                <label class="form-item">
                  <span>异常识别方式</span>
                  <select v-model="visualCondition.method">
                    <option value="deviation">偏差阈值</option>
                    <option value="zscore">标准分数</option>
                    <option value="spike">瞬时尖峰</option>
                  </select>
                </label>
                <label class="form-item">
                  <span>异常阈值</span>
                  <input v-model="visualCondition.deviationThreshold" type="number" step="0.1" />
                </label>
                <label class="form-item">
                  <span>统计窗口(分钟)</span>
                  <input v-model="visualCondition.windowMinutes" type="number" min="1" />
                </label>
                <label class="form-item">
                  <span>最少样本数</span>
                  <input v-model="visualCondition.sampleSize" type="number" min="1" />
                </label>
                <label class="form-item">
                  <span>持续判断秒数</span>
                  <input v-model="visualCondition.stableSeconds" type="number" min="0" />
                </label>
              </div>
            </section>

            <section class="builder-section">
              <div class="builder-section-head">
                <div>
                  <h3>联动动作</h3>
                  <p>支持告警、通知、控制和 AI 诊断等动作组合，按卡片顺序写入。</p>
                </div>
                <div class="inline-actions">
                  <button type="button" class="ghost-button" @click="appendAction('create_alert')">加告警</button>
                  <button type="button" class="ghost-button" @click="appendAction('notify')">加通知</button>
                  <button type="button" class="ghost-button" @click="appendAction('control')">加控制</button>
                  <button type="button" class="ghost-button" @click="appendAction('trigger_ai')">加 AI</button>
                </div>
              </div>

              <div class="builder-card-list">
                <div v-for="(action, index) in visualActions" :key="action.id" class="builder-card">
                  <div class="builder-card-head">
                    <strong>动作 {{ index + 1 }}</strong>
                    <div class="inline-actions">
                      <span class="chip chip-action">{{ singleActionSummary(action) }}</span>
                      <button type="button" class="table-link" @click="removeAction(index)">移除</button>
                    </div>
                  </div>

                  <div class="builder-inline-grid">
                    <label class="form-item">
                      <span>动作类型</span>
                      <select v-model="action.type">
                        <option value="create_alert">创建告警</option>
                        <option value="notify">发送通知</option>
                        <option value="control">触发控制</option>
                        <option value="trigger_ai">触发 AI 诊断</option>
                      </select>
                    </label>

                    <template v-if="action.type === 'create_alert'">
                      <label class="form-item">
                        <span>告警级别</span>
                        <select v-model="action.severity">
                          <option value="critical">{{ enumLabel("severity", "critical") }}</option>
                          <option value="high">{{ enumLabel("severity", "high") }}</option>
                          <option value="medium">{{ enumLabel("severity", "medium") }}</option>
                          <option value="low">{{ enumLabel("severity", "low") }}</option>
                        </select>
                      </label>
                      <label class="form-item">
                        <span>告警标题</span>
                        <input v-model="action.titleTemplate" type="text" placeholder="可选，默认自动生成" />
                      </label>
                    </template>

                    <template v-else-if="action.type === 'notify'">
                      <label class="form-item">
                        <span>通知渠道</span>
                        <select v-model="action.channel">
                          <option value="in_app">{{ enumLabel("channelType", "in_app") }}</option>
                          <option value="wechat">{{ enumLabel("channelType", "wechat") }}</option>
                          <option value="sms">{{ enumLabel("channelType", "sms") }}</option>
                          <option value="email">{{ enumLabel("channelType", "email") }}</option>
                        </select>
                      </label>
                      <label class="form-item">
                        <span>接收对象</span>
                        <input v-model="action.receiverValue" type="text" placeholder="如 ops.lead / 值班群 / 邮件组" />
                      </label>
                    </template>

                    <template v-else-if="action.type === 'control'">
                      <label class="form-item">
                        <span>执行器</span>
                        <select v-model="action.actuatorId">
                          <option value="">请选择执行器</option>
                          <option v-for="actuator in actuators" :key="actuator.id" :value="String(actuator.id)">
                            {{ actuator.actuatorName }}
                          </option>
                        </select>
                      </label>
                      <label class="form-item">
                        <span>控制动作</span>
                        <select v-model="action.controlType">
                          <option value="on">{{ enumLabel("controlType", "on") }}</option>
                          <option value="off">{{ enumLabel("controlType", "off") }}</option>
                          <option value="stop">{{ enumLabel("controlType", "stop") }}</option>
                        </select>
                      </label>
                      <label class="form-item">
                        <span>持续秒数</span>
                        <input v-model="action.durationSeconds" type="number" min="0" />
                      </label>
                    </template>

                    <template v-else>
                      <label class="form-item">
                        <span>AI 任务类型</span>
                        <select v-model="action.taskType">
                          <option value="diagnosis">AI诊断</option>
                          <option value="report">AI报告</option>
                        </select>
                      </label>
                      <label class="form-item">
                        <span>说明</span>
                        <input v-model="action.reasonText" type="text" placeholder="如：触发异常后自动诊断" />
                      </label>
                    </template>
                  </div>
                </div>

                <div v-if="visualActions.length === 0" class="empty-state">当前还没有动作，请至少添加一个动作卡片。</div>
              </div>
            </section>

            <details class="config-disclosure">
              <summary class="config-disclosure-summary">原始配置预览</summary>
              <div class="stack">
                <div class="detail-span">
                  <div class="detail-label">目标 JSON</div>
                  <pre class="json-block">{{ formattedVisualTargetsJson }}</pre>
                </div>
                <div class="detail-span">
                  <div class="detail-label">条件 JSON</div>
                  <pre class="json-block">{{ formattedVisualConditionJson }}</pre>
                </div>
                <div class="detail-span">
                  <div class="detail-label">动作 JSON</div>
                  <pre class="json-block">{{ formattedVisualActionJson }}</pre>
                </div>
              </div>
            </details>
            </div>

            <template v-else>
              <div class="form-stage-grid">
                <label class="form-item form-span">
              <span>目标ID JSON</span>
              <textarea v-model="form.targetIdsJsonText" rows="3" placeholder='如: [1,2,3]' />
                </label>
                <label class="form-item form-span">
              <span>条件 JSON</span>
              <textarea v-model="form.conditionJsonText" rows="8" />
                </label>
                <label class="form-item form-span">
              <span>动作 JSON</span>
              <textarea v-model="form.actionJsonText" rows="8" />
                </label>
              </div>
            </template>
            </div>
          </section>

          <div class="form-actions">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving || !canEdit">
              {{ saving ? "保存中..." : editingRuleId ? "保存修改" : "创建规则" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>规则详情</h2>
          <span class="tag tag-p1">{{ selectedRule?.ruleCode || "未选择" }}</span>
        </div>
        <div v-if="selectedRule" class="stack">
          <div class="detail-grid">
            <div class="detail-card">
              <div class="detail-label">规则名称</div>
              <div class="detail-value">{{ selectedRule.ruleName || "-" }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">当前状态</div>
              <div class="detail-value">{{ selectedRule.enabled ? enumLabel("status", "enabled") : enumLabel("status", "disabled") }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">规则类型</div>
              <div class="detail-value">{{ enumLabel("ruleType", selectedRule.ruleType) }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">目标类型</div>
              <div class="detail-value">{{ enumLabel("targetType", selectedRule.targetType) }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">编辑模式</div>
              <div class="detail-value">{{ enumLabel("builderMode", selectedRule.builderMode) }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">恢复策略</div>
              <div class="detail-value">{{ enumLabel("recoveryPolicy", selectedRule.recoveryPolicy) }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">恢复稳定时间</div>
              <div class="detail-value">{{ selectedRule.recoveryStableSeconds || 0 }} 秒</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">冷却时间</div>
              <div class="detail-value">{{ selectedRule.cooldownSeconds || 0 }} 秒</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">每日上限</div>
              <div class="detail-value">{{ selectedRule.dailyMaxExecutions || 0 }} 次</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">优先级</div>
              <div class="detail-value">{{ selectedRule.priority || "-" }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">条件摘要</div>
              <div class="detail-value">{{ ruleConditionSummary }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">动作摘要</div>
              <div class="detail-value">{{ ruleActionSummary }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">创建人</div>
              <div class="detail-value">{{ selectedRule.createdByName || "-" }}</div>
            </div>
            <div class="detail-card">
              <div class="detail-label">更新时间</div>
              <div class="detail-value">{{ formatDateTime(selectedRule.updatedAt) }}</div>
            </div>
            <div class="detail-card detail-span">
              <div class="detail-label">作用目标</div>
              <div class="detail-value">{{ ruleTargetSummary }}</div>
            </div>
          </div>

          <details class="config-disclosure">
            <summary class="config-disclosure-summary">原始配置</summary>
            <div class="stack">
              <div class="detail-span">
                <div class="detail-label">目标 JSON</div>
                <pre class="json-block">{{ formatJson(selectedRule.targetIdsJson) }}</pre>
              </div>
              <div class="detail-span">
                <div class="detail-label">条件 JSON</div>
                <pre class="json-block">{{ formatJson(selectedRule.conditionJson) }}</pre>
              </div>
              <div class="detail-span">
                <div class="detail-label">动作 JSON</div>
                <pre class="json-block">{{ formatJson(selectedRule.actionJson) }}</pre>
              </div>
            </div>
          </details>
        </div>
        <div v-else class="empty-state">从列表选择一条规则查看详情。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime, formatJson } from "../lib/format";
import { DEFAULT_METRIC_OPTIONS, loadMetricOptions, metricLabel } from "../lib/metrics";
import {
  buildRuleConditionSummary,
  normalizeSecondaryMetricCondition,
  normalizeValueGuardCondition
} from "../lib/rule-conditions";
import { hasPermission } from "../lib/session";

const ACTION_TYPE_OPTIONS = [
  { value: "create_alert", label: "创建告警" },
  { value: "notify", label: "发送通知" },
  { value: "control", label: "触发控制" },
  { value: "trigger_ai", label: "触发 AI 诊断" }
];

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const metricOptions = ref(DEFAULT_METRIC_OPTIONS);
const areas = ref([]);
const sensors = ref([]);
const actuators = ref([]);
const rules = ref([]);
const selectedRule = ref(null);
const editingRuleId = ref(null);
const selectedTargetIds = ref([]);
const targetFilterAreaId = ref("");
const visualActions = ref([]);
const ruleFormStage = ref("base");

const RULE_FORM_STAGES = [
  { code: "base", label: "1. 基础信息" },
  { code: "policy", label: "2. 执行策略" },
  { code: "builder", label: "3. 触发条件与动作" }
];

const filters = reactive({
  keyword: "",
  ruleType: "",
  builderMode: "",
  enabled: ""
});

const form = reactive({
  ruleCode: "",
  ruleName: "",
  ruleType: "threshold",
  targetType: "sensor",
  builderMode: "visual",
  enabled: true,
  recoveryPolicy: "manual_close",
  recoveryStableSeconds: 0,
  cooldownSeconds: 0,
  dailyMaxExecutions: 0,
  priority: 100,
  targetIdsJsonText: "[]",
  conditionJsonText: "{}",
  actionJsonText: "{}"
});

const visualCondition = reactive({
  areaId: "",
  metric: "temperature",
  operator: "<",
  threshold: 30,
  stableSeconds: 300,
  aggregation: "latest",
  secondaryEnabled: false,
  secondaryMetric: "temperature",
  secondaryOperator: ">",
  secondaryThreshold: 35,
  secondaryStableSeconds: 300,
  guardEnabled: false,
  guardMinValid: 0.1,
  guardMaxValid: 100,
  guardMinRecentPositiveCount: 1,
  guardRecentPositiveWindowSeconds: 300,
  guardRecentPositiveThreshold: 0,
  guardInvalidSampleCount: 3,
  guardInvalidWindowSeconds: 300,
  guardCreateAlert: true,
  guardAlertSeverity: "high",
  direction: "rise",
  changeThreshold: 10,
  windowMinutes: 60,
  method: "deviation",
  deviationThreshold: 15,
  sampleSize: 5
});

const canEdit = hasPermission("rule:edit");
const enabledRuleCount = computed(() => rules.value.filter((item) => item.enabled).length);
const visualRuleCount = computed(() => rules.value.filter((item) => item.builderMode === "visual").length);
const highPriorityRuleCount = computed(() => rules.value.filter((item) => Number(item.priority || 0) <= 50).length);
const autoRecoveryRuleCount = computed(() => rules.value.filter((item) => item.recoveryPolicy === "auto_close" || item.recoveryPolicy === "auto_downgrade").length);
const ruleStageStatus = computed(() => ({
  base: Boolean(form.ruleCode && form.ruleName && form.ruleType && form.targetType),
  policy: Boolean(form.recoveryPolicy && Number(form.priority) > 0),
  builder: form.builderMode === "visual"
    ? Boolean(selectedTargetIds.value.length > 0 && visualActions.value.length > 0)
    : Boolean(String(form.targetIdsJsonText || "").trim() && String(form.conditionJsonText || "").trim() && String(form.actionJsonText || "").trim())
}));
const completedRuleStageCount = computed(() => Object.values(ruleStageStatus.value).filter(Boolean).length);
const ruleStageProgressPercent = computed(() =>
  Math.round((completedRuleStageCount.value / RULE_FORM_STAGES.length) * 100)
);
const ruleProgressSummary = computed(() => {
  if (completedRuleStageCount.value === RULE_FORM_STAGES.length) {
    return "规则基础信息、执行策略和联动动作已经齐备，可以直接保存。";
  }
  const nextStage = RULE_FORM_STAGES.find((stage) => !ruleStageStatus.value[stage.code]);
  return nextStage ? `下一步建议补齐：${nextStage.label}` : "继续完善规则信息。";
});

const availableTargetOptions = computed(() => {
  if (form.targetType === "area") {
    return areas.value.map((item) => ({
      id: item.id,
      label: item.areaName,
      desc: [enumLabel("areaType", item.areaType), item.cropType, item.growthStage].filter(Boolean).join(" · ")
    }));
  }

  if (form.targetType === "actuator") {
    return actuators.value
      .filter((item) => !targetFilterAreaId.value || String(item.areaId) === String(targetFilterAreaId.value))
      .map((item) => ({
        id: item.id,
        label: item.actuatorName,
        desc: [item.areaName, enumLabel("actuatorType", item.actuatorType), item.gatewayName].filter(Boolean).join(" · ")
      }));
  }

  return sensors.value
    .filter((item) => !targetFilterAreaId.value || String(item.areaId) === String(targetFilterAreaId.value))
    .map((item) => ({
      id: item.id,
      label: item.sensorName,
      desc: [item.areaName, displayMetricLabel(item.sensorType), item.gatewayName].filter(Boolean).join(" · ")
    }));
});

const selectedTargetChips = computed(() =>
  selectedTargetIds.value
    .map((id) => availableTargetOptions.value.find((item) => item.id === id) || resolveTargetByType(form.targetType, id))
    .filter(Boolean)
);

const parsedRuleCondition = computed(() => parseMaybeJson(selectedRule.value?.conditionJson) || {});
const parsedRuleAction = computed(() => parseMaybeJson(selectedRule.value?.actionJson) || {});
const parsedRuleTargets = computed(() => {
  const value = parseMaybeJson(selectedRule.value?.targetIdsJson);
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return [value];
});

const visualConditionSummary = computed(() => buildConditionSummary(buildVisualConditionPayload(), form.ruleType));
const formattedVisualTargetsJson = computed(() => JSON.stringify(selectedTargetIds.value, null, 2));
const formattedVisualConditionJson = computed(() => JSON.stringify(buildVisualConditionPayload(), null, 2));
const formattedVisualActionJson = computed(() => JSON.stringify(buildVisualActionsPayload(), null, 2));

const ruleConditionSummary = computed(() => buildConditionSummary(parsedRuleCondition.value, selectedRule.value?.ruleType));
const ruleActionSummary = computed(() => buildActionSummary(parsedRuleAction.value));
const ruleTargetSummary = computed(() => {
  if (parsedRuleTargets.value.length === 0) {
    return "未配置目标ID";
  }
  const labels = parsedRuleTargets.value
    .map((id) => resolveTargetByType(selectedRule.value?.targetType, id)?.label || `${selectedRule.value?.targetType}:${id}`)
    .join("、");
  return `${enumLabel("targetType", selectedRule.value?.targetType)}：${labels}`;
});

function normalizeRuleRecord(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    targetIdsJson: parseMaybeJson(row.targetIdsJson) ?? row.targetIdsJson,
    conditionJson: parseMaybeJson(row.conditionJson) ?? row.conditionJson,
    actionJson: parseMaybeJson(row.actionJson) ?? row.actionJson
  };
}

function defaultMetricCode() {
  return metricOptions.value[0]?.metricCode || "temperature";
}

function displayMetricLabel(metricCode) {
  return metricLabel(metricOptions.value, metricCode);
}

function formatMetricOption(metric) {
  return metric.unitName ? `${metric.metricName} (${metric.unitName})` : metric.metricName;
}

function parseMaybeJson(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function createDefaultVisualAction(type = "create_alert") {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    type,
    severity: "medium",
    titleTemplate: "",
    channel: "in_app",
    receiverValue: "",
    actuatorId: actuators.value[0]?.id ? String(actuators.value[0].id) : "",
    controlType: "on",
    durationSeconds: 120,
    taskType: "diagnosis",
    reasonText: ""
  };
}

function defaultCondition() {
  return {
    areaId: "",
    metric: defaultMetricCode(),
    operator: "<",
    threshold: 30,
    stableSeconds: 300,
    aggregation: "latest",
    secondaryEnabled: false,
    secondaryMetric: defaultMetricCode(),
    secondaryOperator: ">",
    secondaryThreshold: 35,
    secondaryStableSeconds: 300,
    guardEnabled: false,
    guardMinValid: 0.1,
    guardMaxValid: 100,
    guardMinRecentPositiveCount: 1,
    guardRecentPositiveWindowSeconds: 300,
    guardRecentPositiveThreshold: 0,
    guardInvalidSampleCount: 3,
    guardInvalidWindowSeconds: 300,
    guardCreateAlert: true,
    guardAlertSeverity: "high",
    direction: "rise",
    changeThreshold: 10,
    windowMinutes: 60,
    method: "deviation",
    deviationThreshold: 15,
    sampleSize: 5
  };
}

function resetVisualBuilder() {
  Object.assign(visualCondition, defaultCondition());
  selectedTargetIds.value = [];
  targetFilterAreaId.value = "";
  visualActions.value = [createDefaultVisualAction("create_alert"), createDefaultVisualAction("notify")];
}

function resetFilters() {
  filters.keyword = "";
  filters.ruleType = "";
  filters.builderMode = "";
  filters.enabled = "";
  loadRules();
}

function resetForm() {
  editingRuleId.value = null;
  ruleFormStage.value = "base";
  form.ruleCode = "";
  form.ruleName = "";
  form.ruleType = "threshold";
  form.targetType = "sensor";
  form.builderMode = "visual";
  form.enabled = true;
  form.recoveryPolicy = "manual_close";
  form.recoveryStableSeconds = 0;
  form.cooldownSeconds = 0;
  form.dailyMaxExecutions = 0;
  form.priority = 100;
  form.targetIdsJsonText = "[]";
  form.conditionJsonText = "{}";
  form.actionJsonText = "{}";
  resetVisualBuilder();
  syncVisualBuilderToText();
}

function startCreate() {
  resetForm();
  errorMessage.value = "";
  message.value = "";
}

function scrollToRuleStage(code) {
  ruleFormStage.value = code;
  if (typeof document === "undefined") {
    return;
  }
  const section = document.getElementById(`rule-stage-${code}`);
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleTarget(id) {
  const numericId = Number(id);
  if (selectedTargetIds.value.includes(numericId)) {
    selectedTargetIds.value = selectedTargetIds.value.filter((item) => item !== numericId);
    return;
  }
  selectedTargetIds.value = [...selectedTargetIds.value, numericId];
}

function appendAction(type) {
  visualActions.value = [...visualActions.value, createDefaultVisualAction(type)];
}

function removeAction(index) {
  visualActions.value = visualActions.value.filter((_, currentIndex) => currentIndex !== index);
}

function resolveTargetByType(targetType, id) {
  const numericId = Number(id);
  if (targetType === "area") {
    const area = areas.value.find((item) => item.id === numericId);
    return area ? { id: numericId, label: area.areaName } : null;
  }
  if (targetType === "actuator") {
    const actuator = actuators.value.find((item) => item.id === numericId);
    return actuator ? { id: numericId, label: actuator.actuatorName } : null;
  }
  const sensor = sensors.value.find((item) => item.id === numericId);
  return sensor ? { id: numericId, label: sensor.sensorName } : null;
}

function buildConditionSummary(condition, ruleType) {
  return buildRuleConditionSummary(condition, ruleType, displayMetricLabel);
}

function buildActionSummary(actionJson) {
  const actions = Array.isArray(actionJson?.actions) ? actionJson.actions : [];
  if (actions.length === 0) {
    return actionJson?.summary || "-";
  }

  return actions.map((item) => singleActionSummary(item)).join("；");
}

function singleActionSummary(action) {
  if (!action) {
    return "动作";
  }
  if (action.type === "create_alert") {
    return `创建${enumLabel("severity", action.severity)}级告警`;
  }
  if (action.type === "notify") {
    const receiverText = action.receiverValue ? `给 ${action.receiverValue}` : "通知";
    return `发送${enumLabel("channelType", action.channel)}${receiverText}`;
  }
  if (action.type === "control") {
    const actuatorName = resolveTargetByType("actuator", action.actuatorId)?.label || `执行器 ${action.actuatorId || "-"}`;
    const durationText = Number(action.durationSeconds || 0) > 0 ? ` ${action.durationSeconds} 秒` : "";
    return `${enumLabel("controlType", action.controlType)} ${actuatorName}${durationText}`;
  }
  if (action.type === "trigger_ai") {
    return action.taskType === "report" ? "触发 AI 报告" : "触发 AI 诊断";
  }
  return ACTION_TYPE_OPTIONS.find((item) => item.value === action.type)?.label || action.type || "动作";
}

function buildVisualConditionPayload() {
  const base = {
    metric: visualCondition.metric,
    areaId: visualCondition.areaId ? Number(visualCondition.areaId) : null
  };

  if (form.ruleType === "trend") {
    return {
      ...base,
      direction: visualCondition.direction,
      changeThreshold: Number(visualCondition.changeThreshold) || 0,
      windowMinutes: Number(visualCondition.windowMinutes) || 60,
      aggregation: visualCondition.aggregation,
      stableSeconds: Number(visualCondition.stableSeconds) || 0,
      summary: buildConditionSummary(
        {
          ...base,
          direction: visualCondition.direction,
          changeThreshold: visualCondition.changeThreshold,
          windowMinutes: visualCondition.windowMinutes,
          aggregation: visualCondition.aggregation,
          stableSeconds: visualCondition.stableSeconds
        },
        "trend"
      )
    };
  }

  if (form.ruleType === "anomaly") {
    return {
      ...base,
      method: visualCondition.method,
      deviationThreshold: Number(visualCondition.deviationThreshold) || 0,
      windowMinutes: Number(visualCondition.windowMinutes) || 60,
      sampleSize: Number(visualCondition.sampleSize) || 5,
      stableSeconds: Number(visualCondition.stableSeconds) || 0,
      summary: buildConditionSummary(
        {
          ...base,
          method: visualCondition.method,
          deviationThreshold: visualCondition.deviationThreshold,
          windowMinutes: visualCondition.windowMinutes,
          sampleSize: visualCondition.sampleSize,
          stableSeconds: visualCondition.stableSeconds
        },
        "anomaly"
      )
    };
  }

  const payload = {
    ...base,
    operator: visualCondition.operator,
    threshold: Number(visualCondition.threshold),
    stableSeconds: Number(visualCondition.stableSeconds) || 0,
    aggregation: visualCondition.aggregation
  };

  const secondaryCondition = visualCondition.secondaryEnabled
      ? normalizeSecondaryMetricCondition({
          metric: visualCondition.secondaryMetric,
          operator: visualCondition.secondaryOperator,
          threshold: Number(visualCondition.secondaryThreshold),
          stableSeconds: Number(visualCondition.secondaryStableSeconds) || Number(visualCondition.stableSeconds) || 0
        }, Number(visualCondition.stableSeconds) || 0)
      : null;
  const valueGuard = visualCondition.guardEnabled
      ? normalizeValueGuardCondition({
          minValid: visualCondition.guardMinValid,
          maxValid: visualCondition.guardMaxValid,
          minRecentPositiveCount: Number(visualCondition.guardMinRecentPositiveCount) || 0,
          recentPositiveWindowSeconds: Number(visualCondition.guardRecentPositiveWindowSeconds) || Number(visualCondition.stableSeconds) || 0,
          recentPositiveThreshold: Number(visualCondition.guardRecentPositiveThreshold) || 0,
          invalidSampleCount: Number(visualCondition.guardInvalidSampleCount) || 0,
          invalidWindowSeconds: Number(visualCondition.guardInvalidWindowSeconds) || Number(visualCondition.stableSeconds) || 0,
          createAlert: visualCondition.guardCreateAlert,
          alertSeverity: visualCondition.guardAlertSeverity
        }, Number(visualCondition.stableSeconds) || 0)
      : null;

  if (secondaryCondition) {
    payload.secondaryCondition = secondaryCondition;
  }
  if (valueGuard) {
    payload.valueGuard = valueGuard;
  }
  payload.summary = buildConditionSummary(payload, "threshold");
  return payload;
}

function buildVisualActionsPayload() {
  const actions = visualActions.value.map((item) => {
    if (item.type === "create_alert") {
      return {
        type: "create_alert",
        severity: item.severity,
        titleTemplate: item.titleTemplate || undefined
      };
    }

    if (item.type === "notify") {
      return {
        type: "notify",
        channel: item.channel,
        receiverValue: item.receiverValue || undefined
      };
    }

    if (item.type === "control") {
      return {
        type: "control",
        actuatorId: item.actuatorId ? Number(item.actuatorId) : null,
        controlType: item.controlType,
        durationSeconds: Number(item.durationSeconds) || 0
      };
    }

    return {
      type: "trigger_ai",
      taskType: item.taskType || "diagnosis",
      reasonText: item.reasonText || undefined
    };
  });

  return {
    summary: actions.map((item) => singleActionSummary(item)).join("；"),
    actions
  };
}

function syncVisualBuilderToText() {
  if (form.builderMode !== "visual") {
    return;
  }
  form.targetIdsJsonText = JSON.stringify(selectedTargetIds.value, null, 2);
  form.conditionJsonText = JSON.stringify(buildVisualConditionPayload(), null, 2);
  form.actionJsonText = JSON.stringify(buildVisualActionsPayload(), null, 2);
}

function syncVisualBuilderFromText() {
  const targetIds = parseMaybeJson(form.targetIdsJsonText);
  selectedTargetIds.value = Array.isArray(targetIds) ? targetIds.map((item) => Number(item)).filter(Boolean) : [];

  const condition = parseMaybeJson(form.conditionJsonText) || {};
  Object.assign(visualCondition, {
    ...defaultCondition(),
    areaId: condition.areaId ? String(condition.areaId) : "",
    metric: condition.metric || defaultMetricCode(),
    operator: condition.operator || "<",
    threshold: condition.threshold ?? 30,
    stableSeconds: condition.stableSeconds ?? 300,
    aggregation: condition.aggregation || "latest",
    direction: condition.direction || "rise",
    changeThreshold: condition.changeThreshold ?? 10,
    windowMinutes: condition.windowMinutes ?? 60,
    method: condition.method || "deviation",
    deviationThreshold: condition.deviationThreshold ?? 15,
    sampleSize: condition.sampleSize ?? 5
  });
  const secondaryCondition = normalizeSecondaryMetricCondition(condition.secondaryCondition, Number(condition.stableSeconds || 0));
  const valueGuard = normalizeValueGuardCondition(condition.valueGuard, Number(condition.stableSeconds || 0));
  Object.assign(visualCondition, {
    secondaryEnabled: Boolean(secondaryCondition),
    secondaryMetric: secondaryCondition?.metric || defaultMetricCode(),
    secondaryOperator: secondaryCondition?.operator || ">",
    secondaryThreshold: secondaryCondition?.threshold ?? 35,
    secondaryStableSeconds: secondaryCondition?.stableSeconds ?? Number(condition.stableSeconds || 300),
    guardEnabled: Boolean(valueGuard),
    guardMinValid: valueGuard?.minValid ?? 0.1,
    guardMaxValid: valueGuard?.maxValid ?? 100,
    guardMinRecentPositiveCount: valueGuard?.minRecentPositiveCount ?? 1,
    guardRecentPositiveWindowSeconds: valueGuard?.recentPositiveWindowSeconds ?? Number(condition.stableSeconds || 300),
    guardRecentPositiveThreshold: valueGuard?.recentPositiveThreshold ?? 0,
    guardInvalidSampleCount: valueGuard?.invalidSampleCount ?? 3,
    guardInvalidWindowSeconds: valueGuard?.invalidWindowSeconds ?? Number(condition.stableSeconds || 300),
    guardCreateAlert: valueGuard?.createAlert !== false,
    guardAlertSeverity: valueGuard?.alertSeverity || "high"
  });

  const actionObject = parseMaybeJson(form.actionJsonText) || {};
  const actions = Array.isArray(actionObject.actions) ? actionObject.actions : [];
  visualActions.value = actions.length > 0
    ? actions.map((item) => ({
        ...createDefaultVisualAction(item.type),
        ...item,
        actuatorId: item.actuatorId ? String(item.actuatorId) : createDefaultVisualAction("control").actuatorId
      }))
    : [createDefaultVisualAction("create_alert")];
}

function ruleConditionSummaryForRow(item) {
  return buildConditionSummary(parseMaybeJson(item?.conditionJson) || {}, item?.ruleType) || item?.conditionSummary || "-";
}

function ruleActionSummaryForRow(item) {
  return buildActionSummary(parseMaybeJson(item?.actionJson) || {}) || item?.actionSummary || "-";
}

async function loadLookups() {
  const [metricRows, areaRows, sensorRows, actuatorRows] = await Promise.all([
    loadMetricOptions(),
    apiRequest("/api/v1/areas"),
    apiRequest("/api/v1/sensors"),
    apiRequest("/api/v1/actuators")
  ]);

  metricOptions.value = metricRows;
  areas.value = areaRows;
  sensors.value = sensorRows;
  actuators.value = actuatorRows;

  if (!metricOptions.value.some((item) => item.metricCode === visualCondition.metric)) {
    visualCondition.metric = defaultMetricCode();
  }
}

async function loadRules() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const rows = await apiRequest(`/api/v1/rules${buildQuery(filters)}`);
    rules.value = rows.map((item) => normalizeRuleRecord(item));
    if (selectedRule.value?.id) {
      const matched = rules.value.find((item) => item.id === selectedRule.value.id);
      if (matched) {
        selectedRule.value = {
          ...selectedRule.value,
          ...matched
        };
      }
    } else if (rules.value[0]) {
      selectedRule.value = rules.value[0];
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function loadRuleDetail(ruleId) {
  errorMessage.value = "";
  try {
    const detail = await apiRequest(`/api/v1/rules/${ruleId}`);
    const summarySource = rules.value.find((item) => item.id === ruleId);
    selectedRule.value = normalizeRuleRecord({
      ...summarySource,
      ...detail
    });
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function startEdit(ruleId) {
  await loadRuleDetail(ruleId);
  if (!selectedRule.value) {
    return;
  }

  ruleFormStage.value = "base";
  editingRuleId.value = selectedRule.value.id;
  form.ruleCode = selectedRule.value.ruleCode;
  form.ruleName = selectedRule.value.ruleName;
  form.ruleType = selectedRule.value.ruleType || "threshold";
  form.targetType = selectedRule.value.targetType || "sensor";
  form.builderMode = selectedRule.value.builderMode || "visual";
  form.enabled = Boolean(selectedRule.value.enabled);
  form.recoveryPolicy = selectedRule.value.recoveryPolicy || "manual_close";
  form.recoveryStableSeconds = selectedRule.value.recoveryStableSeconds || 0;
  form.cooldownSeconds = selectedRule.value.cooldownSeconds || 0;
  form.dailyMaxExecutions = selectedRule.value.dailyMaxExecutions || 0;
  form.priority = selectedRule.value.priority || 100;
  form.targetIdsJsonText = JSON.stringify(parseMaybeJson(selectedRule.value.targetIdsJson) || [], null, 2);
  form.conditionJsonText = JSON.stringify(parseMaybeJson(selectedRule.value.conditionJson) || {}, null, 2);
  form.actionJsonText = JSON.stringify(parseMaybeJson(selectedRule.value.actionJson) || {}, null, 2);
  syncVisualBuilderFromText();
}

async function saveRule() {
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    if (form.builderMode === "visual") {
      syncVisualBuilderToText();
    }

    const payload = {
      ruleCode: form.ruleCode,
      ruleName: form.ruleName,
      ruleType: form.ruleType,
      targetType: form.targetType,
      builderMode: form.builderMode,
      enabled: form.enabled,
      recoveryPolicy: form.recoveryPolicy,
      recoveryStableSeconds: Number(form.recoveryStableSeconds) || 0,
      cooldownSeconds: Number(form.cooldownSeconds) || 0,
      dailyMaxExecutions: Number(form.dailyMaxExecutions) || 0,
      priority: Number(form.priority) || 100,
      targetIdsJson: form.builderMode === "visual" ? selectedTargetIds.value : form.targetIdsJsonText,
      conditionJson: form.builderMode === "visual" ? buildVisualConditionPayload() : form.conditionJsonText,
      actionJson: form.builderMode === "visual" ? buildVisualActionsPayload() : form.actionJsonText
    };

    if (editingRuleId.value) {
      await apiRequest(`/api/v1/rules/${editingRuleId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "规则已更新";
    } else {
      await apiRequest("/api/v1/rules", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "规则已创建";
    }

    resetForm();
    await loadRules();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

watch(
  () => form.builderMode,
  (value) => {
    if (value === "visual") {
      syncVisualBuilderFromText();
      syncVisualBuilderToText();
    }
  }
);

watch(
  () => form.targetType,
  () => {
    selectedTargetIds.value = selectedTargetIds.value.filter((id) => availableTargetOptions.value.some((item) => item.id === id));
    syncVisualBuilderToText();
  }
);

watch(
  () => form.ruleType,
  () => {
    syncVisualBuilderToText();
  }
);

watch(
  () => [
    visualCondition.areaId,
    visualCondition.metric,
    visualCondition.operator,
    visualCondition.threshold,
    visualCondition.stableSeconds,
    visualCondition.aggregation,
    visualCondition.secondaryEnabled,
    visualCondition.secondaryMetric,
    visualCondition.secondaryOperator,
    visualCondition.secondaryThreshold,
    visualCondition.secondaryStableSeconds,
    visualCondition.guardEnabled,
    visualCondition.guardMinValid,
    visualCondition.guardMaxValid,
    visualCondition.guardMinRecentPositiveCount,
    visualCondition.guardRecentPositiveWindowSeconds,
    visualCondition.guardRecentPositiveThreshold,
    visualCondition.guardInvalidSampleCount,
    visualCondition.guardInvalidWindowSeconds,
    visualCondition.guardCreateAlert,
    visualCondition.guardAlertSeverity,
    visualCondition.direction,
    visualCondition.changeThreshold,
    visualCondition.windowMinutes,
    visualCondition.method,
    visualCondition.deviationThreshold,
    visualCondition.sampleSize
  ],
  () => {
    syncVisualBuilderToText();
  }
);

watch(
  selectedTargetIds,
  () => {
    syncVisualBuilderToText();
  },
  { deep: true }
);

watch(
  visualActions,
  () => {
    syncVisualBuilderToText();
  },
  { deep: true }
);

onMounted(async () => {
  await loadLookups();
  resetForm();
  await loadRules();
});
</script>
