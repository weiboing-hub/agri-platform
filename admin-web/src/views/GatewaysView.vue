<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>网关设备管理</h2>
          <p class="muted-text">当前页同时承接网关台账、运行态势和 ESP32 配置化管理。</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadGateways">刷新</button>
          <RouterLink class="ghost-button" to="/devices/firmware/packages">固件包</RouterLink>
          <RouterLink class="ghost-button" :to="selectedGatewayFirmwareJobsLink">升级任务</RouterLink>
          <RouterLink v-if="canEdit" class="ghost-button" to="/devices/templates">设备模板</RouterLink>
          <button v-if="canCreate" class="primary-button" @click="startCreate">新增网关</button>
        </div>
      </div>

      <div class="stats-grid">
        <article class="stat-card">
          <div class="stat-label">网关总数</div>
          <strong>{{ gateways.length }}</strong>
        </article>
        <article class="stat-card">
          <div class="stat-label">在线</div>
          <strong>{{ onlineGatewayCount }}</strong>
        </article>
        <article class="stat-card">
          <div class="stat-label">已配置模板</div>
          <strong>{{ configuredTemplateCount }}</strong>
        </article>
        <article class="stat-card">
          <div class="stat-label">待同步配置</div>
          <strong>{{ pendingConfigCount }}</strong>
        </article>
      </div>

      <div class="toolbar">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="设备编号 / 名称 / SN" />
        </label>
        <label class="filter-item">
          <span>区域</span>
          <select v-model="filters.areaId">
            <option value="">全部</option>
            <option v-for="area in areas" :key="area.id" :value="area.id">
              {{ area.areaName }}
            </option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="loadGateways">查询</button>
        </div>
      </div>

      <div v-if="diagnosticLocatorActive" class="diagnostic-location-strip">
        <div>
          <strong>接入诊断定位</strong>
          <span>当前正在排查 {{ diagnosticGatewayLabel }}，已自动按设备编号筛选并加载网关配置。</span>
        </div>
        <div class="diagnostic-location-actions">
          <RouterLink v-if="selectedGateway" class="context-link" :to="selectedGatewayRealtimeLink">
            查看实时监控
          </RouterLink>
          <RouterLink class="context-link" to="/system/device-credentials">
            返回接入诊断
          </RouterLink>
          <button class="ghost-button" type="button" :disabled="!selectedGateway" @click="copySelectedGatewayTroubleshooting">
            复制排查
          </button>
          <button class="ghost-button" type="button" @click="clearDiagnosticLocator">
            清除定位
          </button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <table class="simple-table">
        <thead>
          <tr>
            <th>设备编号</th>
            <th>名称</th>
            <th>区域</th>
            <th>在线状态</th>
            <th>检测状态</th>
            <th>配置模板</th>
            <th>配置版本</th>
            <th>配置状态</th>
            <th>缓存条数</th>
            <th>补传状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in gateways"
            :key="item.id"
            :class="{ 'gateway-row-selected': selectedGateway?.id === item.id, 'gateway-row-diagnostic': diagnosticLocatorActive && selectedGateway?.id === item.id }"
          >
            <td>
              <div class="gateway-code-cell">
                <span>{{ item.gatewayCode }}</span>
                <span v-if="diagnosticLocatorActive && selectedGateway?.id === item.id" class="tag tag-warning">定位</span>
              </div>
            </td>
            <td>{{ item.gatewayName }}</td>
            <td>{{ item.areaName || "-" }}</td>
            <td><span class="tag" :class="statusClass(item.onlineStatus)">{{ enumLabel("onlineStatus", item.onlineStatus) }}</span></td>
            <td><span class="tag" :class="samplingClass(item.samplingStatus)">{{ enumLabel("samplingStatus", item.samplingStatus) }}</span></td>
            <td>{{ item.deviceTemplateName || "未绑定" }}</td>
            <td>{{ item.deviceConfigVersion ?? 1 }}</td>
            <td>
              <span class="tag" :class="configStatusClass(item.deviceConfigSyncStatus)">
                {{ configStatusLabel(item.deviceConfigSyncStatus) }}
              </span>
            </td>
            <td>{{ item.cachedRecordCount ?? 0 }}</td>
            <td><span class="tag" :class="backfillClass(item.backfillStatus)">{{ enumLabel("backfillStatus", item.backfillStatus) }}</span></td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="showDetail(item)">详情</button>
                <button
                  v-if="canEdit"
                  class="table-link"
                  @click="toggleSampling(item, item.desiredSamplingStatus === 'paused' ? 'running' : 'paused')"
                >
                  {{ item.desiredSamplingStatus === "paused" ? "恢复检测" : "暂停检测" }}
                </button>
                <button v-if="canEdit" class="table-link" @click="openGatewayConfig(item)">参数配置</button>
                <button v-if="canEdit" class="table-link" @click="startEdit(item)">编辑</button>
                <button v-if="canDelete" class="table-link" @click="deleteGateway(item)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && gateways.length === 0">
            <td colspan="11" class="empty-cell">暂无网关数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="loading" class="muted-text">正在加载网关数据...</div>
    </section>

    <section class="panel split-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingGatewayId ? "编辑网关" : "新增网关" }}</h2>
          <span class="tag tag-p0">P0</span>
        </div>

        <form class="form-grid" @submit.prevent="saveGateway">
          <label class="form-item">
            <span>设备编号</span>
            <input v-model="form.gatewayCode" type="text" :disabled="Boolean(editingGatewayId)" placeholder="GW-EAST-001" />
          </label>
          <label class="form-item">
            <span>设备名称</span>
            <input v-model="form.gatewayName" type="text" />
          </label>
          <label class="form-item">
            <span>设备类型</span>
            <select v-model="form.gatewayType">
              <option value="esp32">ESP32</option>
              <option value="linux_gateway">Linux 网关</option>
            </select>
          </label>
          <label class="form-item">
            <span>区域</span>
            <select v-model="form.areaId">
              <option value="">请选择区域</option>
              <option v-for="area in areas" :key="area.id" :value="area.id">
                {{ area.areaName }}
              </option>
            </select>
          </label>
          <label class="form-item">
            <span>SN</span>
            <input v-model="form.serialNo" type="text" />
          </label>
          <label class="form-item">
            <span>IP</span>
            <input v-model="form.ipAddress" type="text" />
          </label>
          <label class="form-item">
            <span>MAC</span>
            <input v-model="form.macAddress" type="text" />
          </label>
          <label class="form-item">
            <span>固件版本</span>
            <input v-model="form.firmwareVersion" type="text" />
          </label>
          <label class="form-item">
            <span>运行模式</span>
            <select v-model="form.runtimeMode">
              <option value="manual">{{ enumLabel("runtimeMode", "manual") }}</option>
              <option value="auto">{{ enumLabel("runtimeMode", "auto") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>控制可用性</span>
            <select v-model="form.controlAvailability">
              <option value="enabled">{{ enumLabel("status", "enabled") }}</option>
              <option value="disabled">{{ enumLabel("status", "disabled") }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>状态</span>
            <select v-model="form.status">
              <option value="enabled">{{ enumLabel("status", "enabled") }}</option>
              <option value="disabled">{{ enumLabel("status", "disabled") }}</option>
            </select>
          </label>
          <label class="form-item form-span">
            <span>备注</span>
            <textarea v-model="form.remark" rows="3" />
          </label>
          <div class="form-actions form-span">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving || !canEdit">
              {{ saving ? "保存中..." : editingGatewayId ? "保存修改" : "创建网关" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <h2>运行详情</h2>
          <span class="tag tag-p1">{{ selectedGateway?.gatewayCode || "未选择" }}</span>
        </div>
        <div v-if="selectedGateway" class="detail-grid">
          <div>
            <div class="detail-label">名称</div>
            <div class="detail-value">{{ selectedGateway.gatewayName }}</div>
          </div>
          <div>
            <div class="detail-label">最近心跳</div>
            <div class="detail-value">{{ formatDateTime(selectedGateway.lastHeartbeatAt) }}</div>
          </div>
          <div>
            <div class="detail-label">固件版本</div>
            <div class="detail-value">{{ selectedGateway.firmwareVersion || "-" }}</div>
          </div>
          <div>
            <div class="detail-label">检测状态</div>
            <div class="detail-value">
              {{ enumLabel("samplingStatus", selectedGateway.samplingStatus) }}
              / 期望 {{ enumLabel("samplingStatus", selectedGateway.desiredSamplingStatus) }}
            </div>
          </div>
          <div>
            <div class="detail-label">最后补传时间</div>
            <div class="detail-value">{{ formatDateTime(selectedGateway.lastBackfillAt) }}</div>
          </div>
          <div>
            <div class="detail-label">命令版本</div>
            <div class="detail-value">
              {{ selectedGateway.appliedCommandVersion ?? 0 }} / {{ selectedGateway.samplingCommandVersion ?? 0 }}
            </div>
          </div>
          <div>
            <div class="detail-label">IP / MAC</div>
            <div class="detail-value">{{ selectedGateway.ipAddress || "-" }} / {{ selectedGateway.macAddress || "-" }}</div>
          </div>
          <div>
            <div class="detail-label">最近检测状态回报</div>
            <div class="detail-value">{{ formatDateTime(selectedGateway.lastSamplingReportedAt) }}</div>
          </div>
          <div>
            <div class="detail-label">控制可用性</div>
            <div class="detail-value">{{ enumLabel("status", selectedGateway.controlAvailability) }}</div>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一个网关查看详情。</div>
      </div>
    </section>

    <section class="panel split-panel gateway-config-panel">
      <div>
        <div class="panel-header">
          <div>
            <h2>ESP32 参数配置</h2>
            <p class="muted-text">这一版先做模板绑定、单设备覆盖和同步状态，不直接把配置塞进系统设置。</p>
          </div>
          <span class="tag tag-p1">{{ gatewayConfig?.gatewayCode || selectedGateway?.gatewayCode || "未选择" }}</span>
        </div>

        <div v-if="configErrorMessage" class="error-text inline-error">{{ configErrorMessage }}</div>
        <div v-if="configMessage" class="success-text">{{ configMessage }}</div>

        <div v-if="selectedGateway" class="gateway-config-sections">
          <div class="form-grid">
            <label class="form-item form-span">
              <span>设备模板</span>
              <select v-model="configForm.templateId">
                <option value="">未绑定模板</option>
                <option v-for="item in templateOptions" :key="item.id" :value="String(item.id)">
                  {{ item.templateName }}
                </option>
              </select>
            </label>
          </div>

          <div class="inline-actions">
            <button class="ghost-button" type="button" @click="applyTemplateConfig">套用模板</button>
            <button class="ghost-button" type="button" @click="resetGatewayConfigForm">恢复当前配置</button>
          </div>

          <article class="detail-card">
            <h3>云端通信</h3>
            <div class="form-grid">
              <label class="form-item form-span">
                <span>API 地址</span>
                <input v-model="configForm.config.cloud.apiHost" type="text" placeholder="http://82.156.45.208" />
              </label>
              <label class="form-item">
                <span>上报周期（ms）</span>
                <input v-model.number="configForm.config.cloud.reportIntervalMs" type="number" min="1000" step="1000" />
              </label>
              <label class="form-item">
                <span>控制轮询（ms）</span>
                <input v-model.number="configForm.config.cloud.controlPollIntervalMs" type="number" min="1000" step="1000" />
              </label>
            </div>
          </article>

          <article class="detail-card">
            <h3>RS485 / Modbus</h3>
            <div class="form-grid">
              <label class="form-item">
                <span>波特率</span>
                <input v-model.number="configForm.config.rs485.baudrate" type="number" min="1200" step="1200" />
              </label>
              <label class="form-item">
                <span>Modbus 地址</span>
                <input v-model.number="configForm.config.rs485.modbusAddress" type="number" min="1" step="1" />
              </label>
              <label class="form-item">
                <span>起始寄存器</span>
                <input v-model.number="configForm.config.rs485.registerStart" type="number" min="0" step="1" />
              </label>
              <label class="form-item">
                <span>寄存器长度</span>
                <input v-model.number="configForm.config.rs485.registerCount" type="number" min="1" step="1" />
              </label>
              <label class="form-item">
                <span>温度索引</span>
                <input v-model.number="configForm.config.rs485.tempRegisterIndex" type="number" min="0" step="1" />
              </label>
              <label class="form-item">
                <span>湿度索引</span>
                <input v-model.number="configForm.config.rs485.humRegisterIndex" type="number" min="0" step="1" />
              </label>
            </div>
          </article>

          <article class="detail-card">
            <h3>控制与能力</h3>
            <div class="form-grid">
              <label class="form-item">
                <span>水泵 GPIO</span>
                <input v-model.number="configForm.config.control.pumpGpio" type="number" min="0" step="1" />
              </label>
              <label class="form-item">
                <span>高电平有效</span>
                <select v-model="activeHighSelect">
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              </label>
              <label class="form-item">
                <span>最大运行（秒）</span>
                <input v-model.number="configForm.config.control.maxRunSeconds" type="number" min="0" step="10" />
              </label>
              <label class="form-item">
                <span>最小停止（秒）</span>
                <input v-model.number="configForm.config.control.minOffSeconds" type="number" min="0" step="5" />
              </label>
              <label class="form-item">
                <span>日累计上限（秒）</span>
                <input v-model.number="configForm.config.control.maxDailyRunSeconds" type="number" min="0" step="30" />
              </label>
              <label class="form-item">
                <span>本地网页</span>
                <select v-model="localWebSelect">
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </select>
              </label>
              <label class="form-item">
                <span>OTA</span>
                <select v-model="otaSelect">
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </select>
              </label>
              <label class="form-item">
                <span>4G 兜底</span>
                <select v-model="cellularSelect">
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </select>
              </label>
            </div>
          </article>

          <article class="detail-card">
            <h3>本地自治</h3>
            <div class="form-grid">
              <label class="form-item">
                <span>断网自治</span>
                <select v-model="autonomyEnabledSelect">
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </select>
              </label>
              <label class="form-item">
                <span>启动阈值（湿度 %）</span>
                <input v-model.number="configForm.config.autonomy.startHumidityBelow" type="number" min="0" max="100" step="1" />
              </label>
              <label class="form-item">
                <span>停止阈值（湿度 %）</span>
                <input v-model.number="configForm.config.autonomy.stopHumidityAbove" type="number" min="0" max="100" step="1" />
              </label>
              <label class="form-item">
                <span>单次脉冲（秒）</span>
                <input v-model.number="configForm.config.autonomy.pulseSeconds" type="number" min="1" step="1" />
              </label>
              <label class="form-item">
                <span>复检间隔（秒）</span>
                <input v-model.number="configForm.config.autonomy.minRecheckSeconds" type="number" min="10" step="10" />
              </label>
              <label class="form-item">
                <span>要求有效传感器</span>
                <select v-model="autonomyRequireValidSensorSelect">
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              </label>
              <label class="form-item">
                <span>云端命令优先</span>
                <select v-model="autonomyDisableWhenCloudCommandPendingSelect">
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              </label>
            </div>
          </article>

          <div class="form-actions">
            <button class="ghost-button" type="button" @click="resetGatewayConfigForm">取消改动</button>
            <button class="primary-button" :disabled="configSaving || !canEdit" @click="saveGatewayConfig">
              {{ configSaving ? "保存中..." : "保存配置" }}
            </button>
          </div>
        </div>
        <div v-else class="empty-state">先选择一个网关，再配置 ESP32 参数。</div>
      </div>

      <div>
        <div class="panel-header">
          <h2>配置摘要</h2>
          <span class="tag tag-p1">{{ gatewayConfig?.configVersion ?? "-" }}</span>
        </div>
        <div v-if="gatewayConfig" class="detail-grid">
          <div>
            <div class="detail-label">模板来源</div>
            <div class="detail-value">{{ gatewayConfig.templateName || "未绑定模板" }}</div>
          </div>
          <div>
            <div class="detail-label">同步状态</div>
            <div class="detail-value">
              <span class="tag" :class="configStatusClass(gatewayConfig.configSyncStatus)">{{ configStatusLabel(gatewayConfig.configSyncStatus) }}</span>
            </div>
          </div>
          <div>
            <div class="detail-label">配置版本</div>
            <div class="detail-value">{{ gatewayConfig.configVersion }}</div>
          </div>
          <div>
            <div class="detail-label">当前来源</div>
            <div class="detail-value">{{ configSourceLabel(gatewayConfig.configSource) }}</div>
          </div>
          <div>
            <div class="detail-label">最近下发</div>
            <div class="detail-value">{{ formatDateTime(gatewayConfig.lastConfigPushedAt) }}</div>
          </div>
          <div>
            <div class="detail-label">最近生效</div>
            <div class="detail-value">{{ formatDateTime(gatewayConfig.lastConfigAppliedAt) }}</div>
          </div>
          <div>
            <div class="detail-label">API 地址</div>
            <div class="detail-value">{{ gatewayConfig.configSummary.apiHost || "-" }}</div>
          </div>
          <div>
            <div class="detail-label">上报 / 轮询</div>
            <div class="detail-value">{{ gatewayConfig.configSummary.reportIntervalMs }} / {{ gatewayConfig.configSummary.controlPollIntervalMs }} ms</div>
          </div>
          <div>
            <div class="detail-label">Modbus / 波特率</div>
            <div class="detail-value">{{ gatewayConfig.configSummary.modbusAddress }} / {{ gatewayConfig.configSummary.baudrate }}</div>
          </div>
          <div>
            <div class="detail-label">GPIO</div>
            <div class="detail-value">水泵 GPIO {{ gatewayConfig.configSummary.pumpGpio }}</div>
          </div>
          <div>
            <div class="detail-label">运行保护</div>
            <div class="detail-value">
              单次 {{ gatewayConfig.configSummary.maxRunSeconds }}s / 停机 {{ gatewayConfig.configSummary.minOffSeconds }}s / 日累计 {{ gatewayConfig.configSummary.maxDailyRunSeconds }}s
            </div>
          </div>
          <div class="detail-span">
            <div class="detail-label">本地自治</div>
            <div class="detail-value">
              {{ gatewayConfig.configSummary.autonomyEnabled ? "启用" : "停用" }}
              <template v-if="gatewayConfig.configSummary.autonomyEnabled">
                · {{ gatewayConfig.configSummary.autonomyStartHumidityBelow }}% 启动
                · {{ gatewayConfig.configSummary.autonomyStopHumidityAbove }}% 停止
                · {{ gatewayConfig.configSummary.autonomyPulseSeconds }}s 脉冲
                · {{ gatewayConfig.configSummary.autonomyMinRecheckSeconds }}s 复检
              </template>
            </div>
          </div>
          <div class="detail-span">
            <div class="detail-label">能力开关</div>
            <div class="chip-list">
              <span class="chip">{{ gatewayConfig.configSummary.localWebEnabled ? "本地网页已启用" : "本地网页关闭" }}</span>
              <span class="chip">{{ gatewayConfig.configSummary.otaEnabled ? "OTA 已启用" : "OTA 关闭" }}</span>
              <span class="chip">{{ gatewayConfig.configSummary.cellularEnabled ? "4G 兜底已启用" : "4G 兜底关闭" }}</span>
            </div>
          </div>
          <div v-if="gatewayConfig.configMessage" class="detail-span">
            <div class="detail-label">状态说明</div>
            <div class="detail-value muted-text">{{ gatewayConfig.configMessage }}</div>
          </div>
          <div class="detail-span gateway-config-actions">
            <button
              v-if="canEdit && gatewayConfig.configSyncStatus !== 'applied'"
              class="ghost-button"
              @click="markGatewayConfigApplied"
            >
              标记已生效
            </button>
            <RouterLink class="ghost-button" to="/devices/templates">去设备模板</RouterLink>
          </div>
          <div class="detail-span">
            <div class="detail-label">最近下发记录</div>
            <div v-if="configLogsLoading" class="muted-text">正在加载配置记录...</div>
            <div v-else-if="configLogs.length" class="gateway-config-log-list">
              <article v-for="item in configLogs" :key="item.id" class="gateway-config-log-card">
                <div class="gateway-config-log-header">
                  <strong>{{ configActionLabel(item.actionType) }}</strong>
                  <div class="chip-list">
                    <span class="chip">V{{ item.configVersion }}</span>
                    <span class="chip" :class="configStatusChipClass(item.syncStatus)">{{ configStatusLabel(item.syncStatus) }}</span>
                  </div>
                </div>
                <div class="gateway-config-log-meta">
                  <span>{{ item.operatorName || "系统" }}</span>
                  <span>{{ formatDateTime(item.createdAt) }}</span>
                  <span>{{ configSourceLabel(item.configSource) }}</span>
                </div>
                <div class="muted-text">{{ item.messageText || "已记录一次配置动作" }}</div>
                <div class="chip-list">
                  <span class="chip">API {{ item.configSummary.apiHost || "-" }}</span>
                  <span class="chip">{{ item.configSummary.reportIntervalMs }} / {{ item.configSummary.controlPollIntervalMs }} ms</span>
                  <span class="chip">Modbus {{ item.configSummary.modbusAddress }}</span>
                  <span class="chip">GPIO {{ item.configSummary.pumpGpio }}</span>
                  <span class="chip">保护 {{ item.configSummary.maxRunSeconds }} / {{ item.configSummary.minOffSeconds }} / {{ item.configSummary.maxDailyRunSeconds }}s</span>
                  <span class="chip">{{ item.configSummary.autonomyEnabled ? `自治 ${item.configSummary.autonomyStartHumidityBelow}%→${item.configSummary.autonomyStopHumidityAbove}%` : "自治关闭" }}</span>
                </div>
              </article>
            </div>
            <div v-else class="empty-state compact-empty-state">还没有配置记录。</div>
          </div>
        </div>
        <div v-else-if="configLoading" class="muted-text">正在读取网关配置...</div>
        <div v-else class="empty-state">从列表选择一个网关查看配置摘要。</div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";
import { cloneGatewayConfig, DEFAULT_ESP32_GATEWAY_CONFIG, normalizeGatewayConfig, type GatewayConfigLogRecord, type GatewayConfigRecord, type GatewayTemplateRecord } from "../lib/gateway-config";
import { hasPermission } from "../lib/session";

interface AreaRecord {
  id: number;
  areaName: string;
}

interface GatewayListRecord {
  id: number;
  gatewayCode: string;
  gatewayName: string;
  gatewayType: string;
  serialNo?: string | null;
  areaId?: number | null;
  areaName?: string | null;
  ipAddress?: string | null;
  macAddress?: string | null;
  firmwareVersion?: string | null;
  onlineStatus?: string | null;
  lastHeartbeatAt?: string | null;
  wifiRssi?: number | null;
  cachedRecordCount?: number | null;
  lastBackfillAt?: string | null;
  backfillStatus?: string | null;
  controlAvailability?: string | null;
  runtimeMode?: string | null;
  samplingStatus?: string | null;
  desiredSamplingStatus?: string | null;
  samplingCommandVersion?: number | null;
  appliedCommandVersion?: number | null;
  lastSamplingCommandAt?: string | null;
  lastSamplingReportedAt?: string | null;
  status?: string | null;
  remark?: string | null;
  deviceTemplateId?: number | null;
  deviceTemplateCode?: string | null;
  deviceTemplateName?: string | null;
  deviceConfigVersion?: number | null;
  deviceConfigSyncStatus?: string | null;
  lastConfigPushedAt?: string | null;
  lastConfigAppliedAt?: string | null;
  deviceConfigMessage?: string | null;
}

const loading = ref(false);
const saving = ref(false);
const configLoading = ref(false);
const configSaving = ref(false);
const configLogsLoading = ref(false);
const errorMessage = ref("");
const configErrorMessage = ref("");
const message = ref("");
const configMessage = ref("");
const gateways = ref<GatewayListRecord[]>([]);
const areas = ref<AreaRecord[]>([]);
const templates = ref<GatewayTemplateRecord[]>([]);
const selectedGateway = ref<GatewayListRecord | null>(null);
const gatewayConfig = ref<GatewayConfigRecord | null>(null);
const configLogs = ref<GatewayConfigLogRecord[]>([]);
const editingGatewayId = ref<number | null>(null);
const route = useRoute();
const router = useRouter();

const filters = reactive({
  keyword: "",
  areaId: ""
});

const form = reactive({
  gatewayCode: "",
  gatewayName: "",
  gatewayType: "esp32",
  serialNo: "",
  areaId: "",
  ipAddress: "",
  macAddress: "",
  firmwareVersion: "",
  runtimeMode: "manual",
  controlAvailability: "enabled",
  status: "enabled",
  remark: ""
});

const configForm = reactive({
  templateId: "",
  config: cloneGatewayConfig(DEFAULT_ESP32_GATEWAY_CONFIG)
});

const canCreate = hasPermission("device:add");
const canEdit = hasPermission("device:edit") || hasPermission("gateway:params_push");
const canDelete = hasPermission("device:delete");

const templateOptions = computed(() => templates.value.filter((item) => item.status === "enabled"));
const onlineGatewayCount = computed(() => gateways.value.filter((item) => item.onlineStatus === "online").length);
const configuredTemplateCount = computed(() => gateways.value.filter((item) => Boolean(item.deviceTemplateId)).length);
const pendingConfigCount = computed(() => gateways.value.filter((item) => item.deviceConfigSyncStatus && item.deviceConfigSyncStatus !== "applied").length);
const diagnosticLocatorActive = computed(() => (
  firstQueryValue(route.query.source) === "ingestDiagnostics"
  && Boolean(filters.keyword || firstQueryValue(route.query.gatewayCode))
));
const diagnosticGatewayLabel = computed(() => {
  if (selectedGateway.value) {
    return `${selectedGateway.value.gatewayName || selectedGateway.value.gatewayCode}（${selectedGateway.value.gatewayCode}）`;
  }
  return filters.keyword || firstQueryValue(route.query.gatewayCode) || "目标网关";
});
const selectedGatewayRealtimeLink = computed(() => ({
  path: "/monitor/realtime",
  query: selectedGateway.value
    ? { source: "ingestDiagnostics", gatewayId: String(selectedGateway.value.id) }
    : { source: "ingestDiagnostics" }
}));
const selectedGatewayFirmwareJobsLink = computed(() => ({
  path: "/devices/firmware/jobs",
  query: selectedGateway.value ? { gatewayId: String(selectedGateway.value.id) } : {}
}));

const activeHighSelect = computed({
  get: () => String(Boolean(configForm.config.control.activeHigh)),
  set: (value: string) => {
    configForm.config.control.activeHigh = value === "true";
  }
});
const localWebSelect = computed({
  get: () => String(Boolean(configForm.config.capabilities.localWebEnabled)),
  set: (value: string) => {
    configForm.config.capabilities.localWebEnabled = value === "true";
  }
});
const otaSelect = computed({
  get: () => String(Boolean(configForm.config.capabilities.otaEnabled)),
  set: (value: string) => {
    configForm.config.capabilities.otaEnabled = value === "true";
  }
});
const cellularSelect = computed({
  get: () => String(Boolean(configForm.config.capabilities.cellularEnabled)),
  set: (value: string) => {
    configForm.config.capabilities.cellularEnabled = value === "true";
  }
});
const autonomyEnabledSelect = computed({
  get: () => String(Boolean(configForm.config.autonomy.enabled)),
  set: (value: string) => {
    configForm.config.autonomy.enabled = value === "true";
  }
});
const autonomyRequireValidSensorSelect = computed({
  get: () => String(Boolean(configForm.config.autonomy.requireValidSensor)),
  set: (value: string) => {
    configForm.config.autonomy.requireValidSensor = value === "true";
  }
});
const autonomyDisableWhenCloudCommandPendingSelect = computed({
  get: () => String(Boolean(configForm.config.autonomy.disableWhenCloudCommandPending)),
  set: (value: string) => {
    configForm.config.autonomy.disableWhenCloudCommandPending = value === "true";
  }
});

function statusClass(status?: string | null) {
  return status === "online" ? "tag-success" : "tag-warning";
}

function backfillClass(status?: string | null) {
  if (status === "running") return "tag-warning";
  if (status === "failed") return "tag-danger";
  return "tag-success";
}

function samplingClass(status?: string | null) {
  return status === "paused" ? "tag-warning" : "tag-success";
}

function configStatusLabel(status?: string | null) {
  switch (status) {
    case "pending_push":
      return "待同步";
    case "applied":
      return "已生效";
    case "draft":
      return "草稿";
    case "failed":
      return "同步失败";
    default:
      return "未配置";
  }
}

function configStatusClass(status?: string | null) {
  if (status === "applied") return "tag-success";
  if (status === "failed") return "tag-danger";
  if (status === "pending_push" || status === "draft") return "tag-warning";
  return "";
}

function configStatusChipClass(status?: string | null) {
  if (status === "applied") return "chip-success";
  if (status === "failed") return "chip-danger";
  if (status === "pending_push" || status === "draft") return "chip-warning";
  return "";
}

function configActionLabel(actionType?: string | null) {
  switch (actionType) {
    case "mark_applied":
      return "人工确认生效";
    case "save_config":
      return "保存配置";
    case "device_report_applied":
      return "设备回报已生效";
    case "device_report_failed":
      return "设备回报失败";
    case "device_report_stale":
      return "设备版本未跟上";
    default:
      return "配置动作";
  }
}

function configSourceLabel(source?: string | null) {
  switch (source) {
    case "gateway":
      return "单设备覆盖";
    case "template":
      return "模板默认值";
    default:
      return "系统默认值";
  }
}

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) {
    return value[0] ? String(value[0]) : "";
  }
  return value ? String(value) : "";
}

function hydrateFiltersFromRoute() {
  filters.keyword = firstQueryValue(route.query.keyword) || firstQueryValue(route.query.gatewayCode);
  filters.areaId = firstQueryValue(route.query.areaId);
}

function syncRouteQuery() {
  const query: Record<string, string> = {};
  const queryGatewayCode = firstQueryValue(route.query.gatewayCode);
  const shouldKeepDiagnosticSource = firstQueryValue(route.query.source) === "ingestDiagnostics" && Boolean(filters.keyword);
  if (shouldKeepDiagnosticSource) query.source = "ingestDiagnostics";
  if (filters.keyword) query.keyword = filters.keyword;
  if (queryGatewayCode && filters.keyword === queryGatewayCode) query.gatewayCode = queryGatewayCode;
  if (filters.areaId) query.areaId = filters.areaId;
  router.replace({ query }).catch(() => {});
}

function resolveSelectedGatewayAfterLoad() {
  const queryGatewayCode = firstQueryValue(route.query.gatewayCode);
  const queryKeyword = filters.keyword || firstQueryValue(route.query.keyword);
  const directGatewayCode = queryGatewayCode && filters.keyword === queryGatewayCode ? queryGatewayCode : "";
  const preferredGateway = directGatewayCode
    ? gateways.value.find((item) => item.gatewayCode === queryGatewayCode)
    : null;

  if (preferredGateway) {
    selectedGateway.value = preferredGateway;
    return;
  }

  if (queryKeyword) {
    const keyword = queryKeyword.toLowerCase();
    const matchedGateway = gateways.value.find((item) => (
      item.gatewayCode.toLowerCase() === keyword
      || item.gatewayName.toLowerCase().includes(keyword)
      || (item.serialNo || "").toLowerCase().includes(keyword)
    ));
    if (matchedGateway) {
      selectedGateway.value = matchedGateway;
      return;
    }
  }

  if (!selectedGateway.value && gateways.value[0]) {
    selectedGateway.value = gateways.value[0];
    return;
  }

  if (selectedGateway.value) {
    const latest = gateways.value.find((item) => item.id === selectedGateway.value?.id);
    selectedGateway.value = latest || gateways.value[0] || null;
    return;
  }

  selectedGateway.value = gateways.value[0] || null;
}

function resetFilters() {
  filters.keyword = "";
  filters.areaId = "";
  router.replace({ query: {} }).catch(() => {});
  void loadGateways();
}

function clearDiagnosticLocator() {
  filters.keyword = "";
  filters.areaId = "";
  selectedGateway.value = null;
  router.replace({ query: {} }).catch(() => {});
  void loadGateways();
}

function buildSelectedGatewayTroubleshootingText() {
  const gateway = selectedGateway.value;
  if (!gateway) {
    return "";
  }
  const config = gatewayConfig.value;
  return [
    "网关排查信息",
    `设备：${gateway.gatewayName || gateway.gatewayCode}`,
    `编号：${gateway.gatewayCode}`,
    `区域：${gateway.areaName || "未绑定区域"}`,
    `在线状态：${enumLabel("onlineStatus", gateway.onlineStatus)}`,
    `检测状态：${enumLabel("samplingStatus", gateway.samplingStatus)} / 期望 ${enumLabel("samplingStatus", gateway.desiredSamplingStatus)}`,
    `最近心跳：${formatDateTime(gateway.lastHeartbeatAt)}`,
    `最近补传：${formatDateTime(gateway.lastBackfillAt)}`,
    `补传状态：${enumLabel("backfillStatus", gateway.backfillStatus)}`,
    `WiFi RSSI：${gateway.wifiRssi ?? "-"} dBm`,
    `IP / MAC：${gateway.ipAddress || "-"} / ${gateway.macAddress || "-"}`,
    `固件版本：${gateway.firmwareVersion || "-"}`,
    `配置模板：${config?.templateName || gateway.deviceTemplateName || "未绑定"}`,
    `配置版本：${config?.configVersion ?? gateway.deviceConfigVersion ?? "-"}`,
    `配置状态：${configStatusLabel(config?.configSyncStatus || gateway.deviceConfigSyncStatus)}`,
    `API 地址：${config?.configSummary.apiHost || "-"}`,
    `上报 / 轮询：${config ? `${config.configSummary.reportIntervalMs} / ${config.configSummary.controlPollIntervalMs} ms` : "-"}`,
    `RS485：地址 ${config?.configSummary.modbusAddress ?? "-"} / 波特率 ${config?.configSummary.baudrate ?? "-"}`,
    `水泵 GPIO：${config?.configSummary.pumpGpio ?? "-"}`,
    `运行保护：${config ? `单次 ${config.configSummary.maxRunSeconds}s / 停机 ${config.configSummary.minOffSeconds}s / 日累计 ${config.configSummary.maxDailyRunSeconds}s` : "-"}`,
    `本地自治：${config?.configSummary.autonomyEnabled ? `${config.configSummary.autonomyStartHumidityBelow}% 启动 / ${config.configSummary.autonomyStopHumidityAbove}% 停止 / ${config.configSummary.autonomyPulseSeconds}s 脉冲 / ${config.configSummary.autonomyMinRecheckSeconds}s 复检` : "关闭"}`,
    "建议：先确认供电和网络，再看实时监控是否有最新读数；如果配置状态为待同步，确认设备是否已拉取并回报新版本。"
  ].join("\n");
}

async function copySelectedGatewayTroubleshooting() {
  if (!selectedGateway.value) {
    return;
  }
  try {
    await copyText(buildSelectedGatewayTroubleshootingText());
    message.value = "当前网关排查信息已复制";
  } catch {
    errorMessage.value = "复制失败，请手动复制页面中的网关信息";
  }
}

async function copyText(value: string) {
  const text = String(value || "");
  if (!text) {
    throw new Error("empty_text");
  }

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("copy_failed");
  }
}

function resetForm() {
  editingGatewayId.value = null;
  form.gatewayCode = "";
  form.gatewayName = "";
  form.gatewayType = "esp32";
  form.serialNo = "";
  form.areaId = "";
  form.ipAddress = "";
  form.macAddress = "";
  form.firmwareVersion = "";
  form.runtimeMode = "manual";
  form.controlAvailability = "enabled";
  form.status = "enabled";
  form.remark = "";
}

function resetGatewayConfigForm() {
  if (gatewayConfig.value) {
    configForm.templateId = gatewayConfig.value.templateId ? String(gatewayConfig.value.templateId) : "";
    configForm.config = cloneGatewayConfig(normalizeGatewayConfig(gatewayConfig.value.config));
    return;
  }
  configForm.templateId = "";
  configForm.config = cloneGatewayConfig(DEFAULT_ESP32_GATEWAY_CONFIG);
}

function resetGatewayConfigLogs() {
  configLogs.value = [];
}

function showDetail(item: GatewayListRecord) {
  selectedGateway.value = item;
  void loadGatewayConfigBundle(item.id);
}

function openGatewayConfig(item: GatewayListRecord) {
  selectedGateway.value = item;
  void loadGatewayConfigBundle(item.id);
}

function startCreate() {
  resetForm();
  message.value = "";
  errorMessage.value = "";
}

function startEdit(item: GatewayListRecord) {
  editingGatewayId.value = item.id;
  form.gatewayCode = item.gatewayCode;
  form.gatewayName = item.gatewayName;
  form.gatewayType = item.gatewayType || "esp32";
  form.serialNo = item.serialNo || "";
  form.areaId = item.areaId ? String(item.areaId) : "";
  form.ipAddress = item.ipAddress || "";
  form.macAddress = item.macAddress || "";
  form.firmwareVersion = item.firmwareVersion || "";
  form.runtimeMode = item.runtimeMode || "manual";
  form.controlAvailability = item.controlAvailability || "enabled";
  form.status = item.status || "enabled";
  form.remark = item.remark || "";
  selectedGateway.value = item;
  void loadGatewayConfigBundle(item.id);
}

function applyTemplateConfig() {
  const template = templates.value.find((item) => String(item.id) === String(configForm.templateId));
  if (!template) {
    return;
  }
  configForm.config = cloneGatewayConfig(normalizeGatewayConfig(template.config));
  configMessage.value = `已套用模板：${template.templateName}`;
}

async function loadAreas() {
  areas.value = await apiRequest<AreaRecord[]>("/api/v1/areas");
}

async function loadTemplates() {
  templates.value = await apiRequest<GatewayTemplateRecord[]>("/api/v1/gateway-templates?gatewayType=esp32");
}

async function loadGateways() {
  loading.value = true;
  errorMessage.value = "";
  try {
    syncRouteQuery();
    gateways.value = await apiRequest<GatewayListRecord[]>(`/api/v1/gateways${buildQuery(filters)}`);
    resolveSelectedGatewayAfterLoad();
    if (selectedGateway.value) {
      await loadGatewayConfigBundle(selectedGateway.value.id);
    } else {
      gatewayConfig.value = null;
      resetGatewayConfigForm();
      resetGatewayConfigLogs();
    }
  } catch (error: any) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function loadGatewayConfigBundle(gatewayId: number) {
  await Promise.all([loadGatewayConfig(gatewayId), loadGatewayConfigLogs(gatewayId)]);
}

async function loadGatewayConfig(gatewayId: number) {
  configLoading.value = true;
  configErrorMessage.value = "";
  try {
    gatewayConfig.value = await apiRequest<GatewayConfigRecord>(`/api/v1/gateways/${gatewayId}/device-config`);
    resetGatewayConfigForm();
  } catch (error: any) {
    gatewayConfig.value = null;
    configErrorMessage.value = error.message;
  } finally {
    configLoading.value = false;
  }
}

async function loadGatewayConfigLogs(gatewayId: number) {
  configLogsLoading.value = true;
  try {
    configLogs.value = await apiRequest<GatewayConfigLogRecord[]>(`/api/v1/gateways/${gatewayId}/device-config/logs`);
  } catch (error: any) {
    configErrorMessage.value = error.message;
    configLogs.value = [];
  } finally {
    configLogsLoading.value = false;
  }
}

async function saveGateway() {
  if (!canEdit) {
    return;
  }
  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      gatewayCode: form.gatewayCode,
      gatewayName: form.gatewayName,
      gatewayType: form.gatewayType,
      serialNo: form.serialNo,
      areaId: form.areaId || null,
      ipAddress: form.ipAddress,
      macAddress: form.macAddress,
      firmwareVersion: form.firmwareVersion,
      runtimeMode: form.runtimeMode,
      controlAvailability: form.controlAvailability,
      status: form.status,
      remark: form.remark
    };
    if (editingGatewayId.value) {
      await apiRequest(`/api/v1/gateways/${editingGatewayId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "网关已更新";
    } else {
      await apiRequest("/api/v1/gateways", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "网关已创建";
    }
    resetForm();
    await loadGateways();
  } catch (error: any) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function saveGatewayConfig() {
  if (!canEdit || !selectedGateway.value) {
    return;
  }
  configSaving.value = true;
  configErrorMessage.value = "";
  configMessage.value = "";
  try {
    await apiRequest(`/api/v1/gateways/${selectedGateway.value.id}/device-config`, {
      method: "PUT",
      body: JSON.stringify({
        templateId: configForm.templateId || null,
        config: configForm.config
      })
    });
    configMessage.value = "ESP32 配置已保存，当前状态已标记为待同步";
    await loadGatewayConfigBundle(selectedGateway.value.id);
    await loadGateways();
  } catch (error: any) {
    configErrorMessage.value = error.message;
  } finally {
    configSaving.value = false;
  }
}

async function markGatewayConfigApplied() {
  if (!selectedGateway.value) {
    return;
  }
  configSaving.value = true;
  configErrorMessage.value = "";
  configMessage.value = "";
  try {
    await apiRequest(`/api/v1/gateways/${selectedGateway.value.id}/device-config/mark-applied`, {
      method: "POST"
    });
    configMessage.value = "已标记为设备配置生效";
    await loadGatewayConfigBundle(selectedGateway.value.id);
    await loadGateways();
  } catch (error: any) {
    configErrorMessage.value = error.message;
  } finally {
    configSaving.value = false;
  }
}

async function toggleSampling(item: GatewayListRecord, desiredSamplingStatus: string) {
  if (!canEdit) {
    return;
  }
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/gateways/${item.id}/sampling-state`, {
      method: "POST",
      body: JSON.stringify({ desiredSamplingStatus })
    });
    message.value = desiredSamplingStatus === "paused" ? "暂停检测指令已下发" : "恢复检测指令已下发";
    await loadGateways();
  } catch (error: any) {
    errorMessage.value = error.message;
  }
}

async function deleteGateway(item: GatewayListRecord) {
  if (!canDelete) {
    return;
  }
  const confirmed = window.confirm(`确认删除网关“${item.gatewayName}”吗？`);
  if (!confirmed) {
    return;
  }

  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/gateways/${item.id}`, {
      method: "DELETE"
    });
    if (selectedGateway.value?.id === item.id) {
      selectedGateway.value = null;
      gatewayConfig.value = null;
    }
    if (editingGatewayId.value === item.id) {
      resetForm();
    }
    message.value = "网关已删除";
    await loadGateways();
  } catch (error: any) {
    errorMessage.value = error.message;
  }
}

onMounted(async () => {
  hydrateFiltersFromRoute();
  await loadAreas();
  await loadTemplates();
  await loadGateways();
});
</script>
