<template>
  <div class="stack">
    <section class="panel">
      <div class="panel-header">
        <h2>摄像头管理</h2>
        <div class="inline-actions">
          <button class="ghost-button" @click="loadCameras">刷新</button>
          <button v-if="canCreate" class="primary-button" @click="startCreate">新增摄像头</button>
        </div>
      </div>

      <div class="metric-strip actuator-summary-strip">
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ cameras.length }}</div>
          <div class="stat-desc">当前摄像头</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ onlineCameraCount }}</div>
          <div class="stat-desc">在线摄像头</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ snapshotEnabledCount }}</div>
          <div class="stat-desc">已启用抓图</div>
        </article>
        <article class="roadmap-card timeline-summary-card">
          <div class="stat-value">{{ recordEnabledCount }}</div>
          <div class="stat-desc">已启用录像</div>
        </article>
      </div>

      <div class="mobile-only mobile-filter-summary">
        <div class="mobile-filter-summary-copy">
          <strong>当前筛选</strong>
          <span>{{ filters.keyword || "全部摄像头" }} · {{ areas.find((item) => String(item.id) === String(filters.areaId))?.areaName || "全部区域" }} · {{ filters.onlineStatus ? enumLabel("onlineStatus", filters.onlineStatus) : "全部状态" }}</span>
        </div>
        <button class="ghost-button" @click="mobileFiltersOpen = !mobileFiltersOpen">
          {{ mobileFiltersOpen ? "收起筛选" : "展开筛选" }}
        </button>
      </div>

      <div class="toolbar desktop-filter-toolbar mobile-filter-toolbar" :class="{ 'mobile-filter-toolbar-open': mobileFiltersOpen }">
        <label class="filter-item">
          <span>关键字</span>
          <input v-model="filters.keyword" type="text" placeholder="编号 / 名称 / IP" />
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
        <label class="filter-item">
          <span>在线状态</span>
          <select v-model="filters.onlineStatus">
            <option value="">全部</option>
            <option value="online">{{ enumLabel("onlineStatus", "online") }}</option>
            <option value="offline">{{ enumLabel("onlineStatus", "offline") }}</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="ghost-button" @click="resetFilters">重置</button>
          <button class="primary-button" @click="searchCameras">查询</button>
        </div>
      </div>

      <div v-if="message" class="success-text">{{ message }}</div>
      <div v-if="errorMessage" class="error-text inline-error">{{ errorMessage }}</div>

      <section v-if="selectedCamera" class="mobile-only mobile-inline-detail-card">
        <div class="mobile-inline-detail-head">
          <div>
            <div class="mobile-field-kicker">当前摄像头</div>
            <strong class="mobile-inline-detail-title">{{ selectedCamera.cameraName }}</strong>
            <div class="mobile-inline-detail-subtitle">
              {{ selectedCamera.cameraCode }} · {{ enumLabel("onlineStatus", selectedCamera.onlineStatus) }}
            </div>
          </div>
          <div class="responsive-card-tags">
            <span class="tag" :class="selectedCamera.onlineStatus === 'online' ? 'tag-success' : 'tag-warning'">
              {{ enumLabel("onlineStatus", selectedCamera.onlineStatus) }}
            </span>
            <span class="tag tag-p2">{{ enumLabel("streamProtocol", selectedCamera.streamProtocol) }}</span>
          </div>
        </div>

        <div class="mobile-inline-detail-grid">
          <div class="responsive-card-field">
            <span>区域</span>
            <strong>{{ selectedCamera.areaName || "-" }}</strong>
          </div>
          <div class="responsive-card-field">
            <span>网关</span>
            <strong>{{ selectedCamera.gatewayName || "-" }}</strong>
          </div>
          <div class="responsive-card-field">
            <span>抓图 / 录像</span>
            <strong>{{ selectedCamera.snapshotEnabled ? "抓图启用" : "抓图关闭" }} · {{ selectedCamera.recordEnabled ? "录像启用" : "录像关闭" }}</strong>
          </div>
          <div class="responsive-card-field">
            <span>IP</span>
            <strong>{{ selectedCamera.ipAddress || "未登记" }}</strong>
          </div>
        </div>

        <div class="detail-card camera-diagnostics-card camera-diagnostics-card-mobile">
          <div class="camera-diagnostics-head">
            <div>
              <div class="detail-label">配置自检</div>
              <div class="detail-value">{{ cameraDiagnosticSummary }}</div>
            </div>
            <span class="camera-diagnostics-score">{{ cameraDiagnosticScore.ok }}/{{ cameraDiagnosticScore.total }}</span>
          </div>
          <div class="camera-diagnostic-list">
            <div
              v-for="item in cameraDiagnosticItems"
              :key="item.key"
              class="camera-diagnostic-item"
              :class="`camera-diagnostic-item-${item.status}`"
            >
              <span class="tag" :class="diagnosticTagClass(item.status)">{{ diagnosticStatusLabel(item.status) }}</span>
              <div>
                <strong>{{ item.label }}</strong>
                <p>{{ item.description }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="mobile-inline-detail-actions">
          <RouterLink :to="cameraCapturePlansRoute" class="mobile-field-shortcut">抓图计划</RouterLink>
          <RouterLink :to="cameraTimelineRoute" class="mobile-field-shortcut">图片时间轴</RouterLink>
          <button
            v-if="selectedCameraPreviewSupported"
            class="ghost-button"
            type="button"
            @click="toggleLivePreview"
          >
            {{ livePreviewVisible ? "收起直播" : "直播预览" }}
          </button>
          <a
            v-if="selectedCameraPlayUrl"
            :href="selectedCameraPlayUrl"
            class="mobile-field-shortcut"
            target="_blank"
            rel="noreferrer"
          >
            打开回放
          </a>
          <button
            v-if="canEdit"
            class="ghost-button"
            type="button"
            @click="runMobileCapture"
            :disabled="capturingNow"
          >
            {{ capturingNow ? "抓图中..." : "立即抓图" }}
          </button>
          <button class="ghost-button" type="button" @click="copySelectedCameraText(selectedCamera.sourceUrl, '源流地址')" :disabled="!selectedCamera.sourceUrl">
            复制源流
          </button>
          <button class="ghost-button" type="button" @click="copySelectedCameraText(selectedCamera.targetUrl, '转出地址')" :disabled="!selectedCamera.targetUrl">
            复制转出
          </button>
          <button
            v-if="canRevealUploadUrl"
            class="ghost-button"
            type="button"
            @click="revealCameraUploadUrl"
            :disabled="revealingUploadUrl"
          >
            {{ revealingUploadUrl ? "生成中..." : "推图地址" }}
          </button>
          <button v-if="canEdit" class="primary-button" type="button" @click="message = '手机端暂只支持查看与联动，编辑请切到桌面端。'">
            桌面端编辑
          </button>
        </div>

        <div v-if="cameraUploadUrl" class="mobile-inline-detail-copy">
          HTTP 推图地址：{{ cameraUploadUrl }}
        </div>

        <div class="detail-card camera-access-card camera-access-card-mobile">
          <div class="camera-access-head">
            <div>
              <div class="detail-label">接入参数</div>
              <div class="detail-value">{{ selectedMediaNode ? selectedMediaNode.nodeName : "未绑定媒体节点" }}</div>
            </div>
            <button class="ghost-button" type="button" @click="copyCameraAccessParams">复制</button>
          </div>
          <pre class="camera-access-snippet">{{ cameraAccessParameterText }}</pre>
        </div>

        <div v-if="livePreviewVisible" class="detail-card mobile-camera-live-card">
          <div class="mobile-camera-latest-head">
            <div>
              <div class="detail-label">实时预览</div>
              <div class="detail-value">{{ livePreviewLabel }}</div>
            </div>
            <span class="tag tag-p2">{{ livePreviewModeLabel }}</span>
          </div>
          <div v-if="livePreviewError" class="error-text inline-error">{{ livePreviewError }}</div>
          <div v-if="selectedCameraPreviewSupported" class="camera-live-player">
            <video
              ref="mobileLiveVideoRef"
              class="camera-live-video"
              controls
              playsinline
              muted
              autoplay
            />
          </div>
          <div v-else class="mobile-inline-detail-copy">当前转出地址不支持页内播放，请使用“打开回放”。</div>
        </div>

        <div class="detail-card mobile-camera-latest-card">
          <div class="mobile-camera-latest-head">
            <div>
              <div class="detail-label">最新抓图</div>
              <div class="detail-value">
                {{ latestCameraSnapshot ? formatDateTime(latestCameraSnapshot.capturedAt || latestCameraSnapshot.receivedAt) : "当前还没有抓图记录" }}
              </div>
            </div>
            <span v-if="latestCameraSnapshot" class="tag tag-p2">
              {{ enumLabel("snapshotSourceType", latestCameraSnapshot.sourceType) }}
            </span>
          </div>

          <div v-if="latestSnapshotLoading" class="mobile-inline-detail-copy">正在加载最新图片...</div>
          <template v-else-if="latestCameraSnapshot">
            <img
              class="mobile-camera-latest-image"
              :src="latestCameraSnapshot.thumbnailUrl || latestCameraSnapshot.fileUrl"
              :alt="latestCameraSnapshot.previewText || selectedCamera.cameraName"
            />
            <div class="mobile-camera-latest-meta">
              <span>{{ latestCameraSnapshot.snapshotNo }}</span>
              <span>{{ latestCameraSnapshot.imageWidth || "-" }} × {{ latestCameraSnapshot.imageHeight || "-" }}</span>
            </div>
            <div class="mobile-inline-detail-actions">
              <a
                v-if="latestCameraSnapshot.fileUrl"
                :href="latestCameraSnapshot.fileUrl"
                class="mobile-field-shortcut"
                target="_blank"
                rel="noreferrer"
              >
                查看原图
              </a>
              <button
                class="ghost-button"
                type="button"
                @click="copySelectedCameraText(latestCameraSnapshot.fileUrl || latestCameraSnapshot.thumbnailUrl, '图片地址')"
                :disabled="!(latestCameraSnapshot.fileUrl || latestCameraSnapshot.thumbnailUrl)"
              >
                复制图片地址
              </button>
            </div>
          </template>
          <div v-else class="mobile-inline-detail-copy">
            当前摄像头还没有可预览的图片，可以先立即抓图，或进入抓图计划页面查看调度状态。
          </div>
        </div>
      </section>

      <table class="simple-table desktop-table-only">
        <thead>
          <tr>
            <th>摄像头编号</th>
            <th>名称</th>
            <th>区域</th>
            <th>网关</th>
            <th>媒体节点</th>
            <th>协议</th>
            <th>在线状态</th>
            <th>抓图</th>
            <th>录像</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in cameras" :key="item.id">
            <td>{{ item.cameraCode }}</td>
            <td>{{ item.cameraName }}</td>
            <td>{{ item.areaName || "-" }}</td>
            <td>{{ item.gatewayName || "-" }}</td>
            <td>{{ item.mediaNodeName || "-" }}</td>
            <td>{{ enumLabel("streamProtocol", item.streamProtocol) }}</td>
            <td><span class="tag" :class="item.onlineStatus === 'online' ? 'tag-success' : 'tag-warning'">{{ enumLabel("onlineStatus", item.onlineStatus) }}</span></td>
            <td>{{ item.snapshotEnabled ? "启用" : "关闭" }}</td>
            <td>{{ item.recordEnabled ? "启用" : "关闭" }}</td>
            <td>
              <div class="table-actions">
                <button class="table-link" @click="showDetail(item)">详情</button>
                <button v-if="canEdit" class="table-link" @click="startEdit(item)">编辑</button>
                <button v-if="canDelete" class="table-link" @click="deleteCamera(item)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && cameras.length === 0">
            <td colspan="10" class="empty-cell">暂无摄像头数据</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && cameras.length > 0" class="responsive-card-list tablet-card-list">
        <article
          v-for="item in cameras"
          :key="item.id"
          class="responsive-entity-card"
          :class="{ active: selectedCamera?.id === item.id || editingCameraId === item.id }"
        >
          <div class="responsive-card-head">
            <div class="table-primary-cell">
              <strong>{{ item.cameraName }}</strong>
              <span>{{ item.cameraCode }} · {{ item.ipAddress || "未登记 IP" }}</span>
            </div>
            <div class="responsive-card-tags">
              <span class="tag" :class="item.onlineStatus === 'online' ? 'tag-success' : 'tag-warning'">
                {{ enumLabel("onlineStatus", item.onlineStatus) }}
              </span>
              <span class="tag tag-p2">{{ enumLabel("streamProtocol", item.streamProtocol) }}</span>
            </div>
          </div>
          <div class="responsive-card-grid">
            <div class="responsive-card-field">
              <span>区域</span>
              <strong>{{ item.areaName || "-" }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>网关</span>
              <strong>{{ item.gatewayName || "-" }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>媒体节点</span>
              <strong>{{ item.mediaNodeName || "-" }}</strong>
            </div>
            <div class="responsive-card-field">
              <span>抓图 / 录像</span>
              <strong>{{ item.snapshotEnabled ? "抓图启用" : "抓图关闭" }} · {{ item.recordEnabled ? "录像启用" : "录像关闭" }}</strong>
            </div>
          </div>
          <div class="responsive-card-actions">
            <button class="ghost-button" @click="showDetail(item)">详情</button>
            <button v-if="canEdit" class="ghost-button" @click="startEdit(item)">编辑</button>
            <button v-if="canDelete" class="ghost-button danger-button" @click="deleteCamera(item)">删除</button>
          </div>
        </article>
      </div>
      <div v-if="!loading && cameras.length === 0" class="empty-state tablet-card-empty">暂无摄像头数据</div>
    </section>

    <section class="panel split-panel mobile-detail-panel">
      <div>
        <div class="panel-header">
          <h2>{{ editingCameraId ? "编辑摄像头" : "新增摄像头" }}</h2>
          <span class="tag tag-p2">camera</span>
        </div>

        <div class="form-progress-banner">
          <div class="form-progress-copy">
            <small>表单进度</small>
            <strong>已完成 {{ completedCameraStageCount }}/{{ CAMERA_FORM_STAGES.length }} 个步骤</strong>
            <span>{{ cameraProgressSummary }}</span>
          </div>
          <div class="form-progress-visual">
            <div class="form-progress-track">
              <span class="form-progress-bar" :style="{ width: `${cameraStageProgressPercent}%` }" />
            </div>
            <strong>{{ cameraStageProgressPercent }}%</strong>
          </div>
        </div>

        <div class="chip-list form-stage-strip">
          <button
            v-for="stage in CAMERA_FORM_STAGES"
            :key="stage.code"
            type="button"
            class="chip chip-button form-stage-button"
            :class="{
              'form-stage-button-active': cameraFormStage === stage.code,
              'form-stage-button-complete': cameraStageStatus[stage.code]
            }"
            @click="scrollToCameraStage(stage.code)"
          >
            <span>{{ stage.label }}</span>
            <small>{{ cameraStageStatus[stage.code] ? "已完成" : "待补充" }}</small>
          </button>
        </div>

        <form class="stack" @submit.prevent="saveCamera">
          <section
            id="camera-stage-profile"
            class="form-stage-panel"
            :class="{ 'form-stage-panel-collapsed': cameraFormStage !== 'profile' && cameraStageStatus.profile }"
          >
            <div class="builder-section-head">
              <div>
                <h3>1. 设备档案</h3>
                <p>先确认编号、名称、型号与当前启停状态，保证台账可识别。</p>
              </div>
              <div class="inline-actions">
                <span class="chip chip-permission">{{ form.cameraCode || "未填写编号" }}</span>
                <button
                  v-if="cameraFormStage !== 'profile' && cameraStageStatus.profile"
                  type="button"
                  class="ghost-button"
                  @click="scrollToCameraStage('profile')"
                >
                  展开
                </button>
              </div>
            </div>
            <div v-show="cameraFormStage === 'profile' || !cameraStageStatus.profile" class="form-stage-grid">
              <label class="form-item">
                <span>摄像头编号</span>
                <input v-model="form.cameraCode" type="text" :disabled="Boolean(editingCameraId)" placeholder="CAM-EAST-001" />
              </label>
              <label class="form-item">
                <span>摄像头名称</span>
                <input v-model="form.cameraName" type="text" />
              </label>
              <label class="form-item">
                <span>摄像头类型</span>
                <select v-model="form.cameraType">
                  <option value="ip_camera">{{ enumLabel("cameraType", "ip_camera") }}</option>
                  <option value="wifi_camera">{{ enumLabel("cameraType", "wifi_camera") }}</option>
                  <option value="thermal_camera">{{ enumLabel("cameraType", "thermal_camera") }}</option>
                </select>
              </label>
              <label class="form-item">
                <span>状态</span>
                <select v-model="form.status">
                  <option value="enabled">{{ enumLabel("status", "enabled") }}</option>
                  <option value="disabled">{{ enumLabel("status", "disabled") }}</option>
                </select>
              </label>
              <label class="form-item">
                <span>品牌</span>
                <input v-model="form.vendorName" type="text" />
              </label>
              <label class="form-item">
                <span>型号</span>
                <input v-model="form.modelName" type="text" />
              </label>
              <label class="form-item form-span">
                <span>序列号</span>
                <input v-model="form.serialNo" type="text" />
              </label>
            </div>
          </section>

          <section
            id="camera-stage-network"
            class="form-stage-panel"
            :class="{ 'form-stage-panel-collapsed': cameraFormStage !== 'network' && cameraStageStatus.network }"
          >
            <div class="builder-section-head">
              <div>
                <h3>2. 所属与位置</h3>
                <p>把摄像头和区域、网关、媒体节点、现场位置关联起来，后续排障会更快。</p>
              </div>
              <div class="inline-actions">
                <span class="chip">{{ areas.length }} 个区域可选</span>
                <button
                  v-if="cameraFormStage !== 'network' && cameraStageStatus.network"
                  type="button"
                  class="ghost-button"
                  @click="scrollToCameraStage('network')"
                >
                  展开
                </button>
              </div>
            </div>
            <div v-show="cameraFormStage === 'network' || !cameraStageStatus.network" class="form-stage-grid">
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
                <span>网关</span>
                <select v-model="form.gatewayId">
                  <option value="">请选择网关</option>
                  <option v-for="gateway in gateways" :key="gateway.id" :value="gateway.id">
                    {{ gateway.gatewayName }}
                  </option>
                </select>
              </label>
              <label class="form-item">
                <span>媒体节点</span>
                <select v-model="form.mediaNodeId">
                  <option value="">请选择节点</option>
                  <option v-for="node in mediaNodes" :key="node.id" :value="node.id">
                    {{ node.nodeName }}
                  </option>
                </select>
              </label>
              <label class="form-item">
                <span>IP 地址</span>
                <input v-model="form.ipAddress" type="text" />
              </label>
              <label class="form-item">
                <span>MAC 地址</span>
                <input v-model="form.macAddress" type="text" />
              </label>
              <label class="form-item">
                <span>WiFi 名称</span>
                <input v-model="form.wifiSsid" type="text" />
              </label>
              <label class="form-item">
                <span>安装位置</span>
                <input v-model="form.installPosition" type="text" />
              </label>
              <label class="form-item">
                <span>朝向说明</span>
                <input v-model="form.orientationText" type="text" />
              </label>
            </div>
          </section>

          <section
            id="camera-stage-stream"
            class="form-stage-panel"
            :class="{ 'form-stage-panel-collapsed': cameraFormStage !== 'stream' && cameraStageStatus.stream }"
          >
            <div class="builder-section-head">
              <div>
                <h3>3. 流地址与推图</h3>
                <p>管理主流协议、源流地址、转出地址和登录信息，便于推流与回放联动。</p>
              </div>
              <div class="inline-actions">
                <span class="chip chip-action">{{ enumLabel("streamProtocol", form.streamProtocol) }}</span>
                <button
                  v-if="cameraFormStage !== 'stream' && cameraStageStatus.stream"
                  type="button"
                  class="ghost-button"
                  @click="scrollToCameraStage('stream')"
                >
                  展开
                </button>
              </div>
            </div>
            <div v-show="cameraFormStage === 'stream' || !cameraStageStatus.stream" class="form-stage-grid">
              <label class="form-item">
                <span>抓图模式</span>
                <select v-model="form.captureMode">
                  <option value="manual">{{ enumLabel("captureMode", "manual") }}</option>
                  <option value="schedule">{{ enumLabel("captureMode", "schedule") }}</option>
                  <option value="event">{{ enumLabel("captureMode", "event") }}</option>
                </select>
              </label>
              <label class="form-item">
                <span>主流协议</span>
                <select v-model="form.streamProtocol">
                  <option value="rtsp">{{ enumLabel("streamProtocol", "rtsp") }}</option>
                  <option value="rtmp">{{ enumLabel("streamProtocol", "rtmp") }}</option>
                  <option value="http">{{ enumLabel("streamProtocol", "http") }}</option>
                  <option value="ftp">{{ enumLabel("streamProtocol", "ftp") }}</option>
                </select>
              </label>
              <label class="form-item form-span">
                <span>源流地址</span>
                <input v-model="form.sourceUrl" type="text" placeholder="rtsp://user:pass@192.168.1.60:554/stream1" />
              </label>
              <label class="form-item form-span">
                <span>转出地址</span>
                <input v-model="form.targetUrl" type="text" placeholder="http://media.local/hls/cam-east-001.m3u8" />
              </label>
              <label class="form-item">
                <span>流账号</span>
                <input v-model="form.streamUsername" type="text" />
              </label>
              <label class="form-item">
                <span>流密码</span>
                <input v-model="form.streamPassword" type="password" />
              </label>
            </div>
          </section>

          <section
            id="camera-stage-media"
            class="form-stage-panel"
            :class="{ 'form-stage-panel-collapsed': cameraFormStage !== 'media' && cameraStageStatus.media }"
          >
            <div class="builder-section-head">
              <div>
                <h3>4. 抓图与录像策略</h3>
                <p>最后确认抓图开关、录像开关和备注，决定这台摄像头的媒体采集方式。</p>
              </div>
              <div class="inline-actions">
                <span class="chip">{{ form.snapshotEnabled ? "抓图启用" : "抓图关闭" }}</span>
                <button
                  v-if="cameraFormStage !== 'media' && cameraStageStatus.media"
                  type="button"
                  class="ghost-button"
                  @click="scrollToCameraStage('media')"
                >
                  展开
                </button>
              </div>
            </div>
            <div v-show="cameraFormStage === 'media' || !cameraStageStatus.media" class="form-stage-grid">
              <label class="form-item">
                <span>抓图开关</span>
                <select v-model="form.snapshotEnabled">
                  <option :value="true">启用</option>
                  <option :value="false">关闭</option>
                </select>
              </label>
              <label class="form-item">
                <span>录像开关</span>
                <select v-model="form.recordEnabled">
                  <option :value="true">启用</option>
                  <option :value="false">关闭</option>
                </select>
              </label>
              <label class="form-item form-span">
                <span>备注</span>
                <textarea v-model="form.remark" rows="3" />
              </label>
            </div>
          </section>

          <div class="form-actions">
            <button class="ghost-button" type="button" @click="resetForm">清空</button>
            <button class="primary-button" :disabled="saving || !(canCreate || canEdit)">
              {{ saving ? "保存中..." : editingCameraId ? "保存修改" : "创建摄像头" }}
            </button>
          </div>
        </form>
      </div>

      <div>
        <div class="panel-header">
          <div>
            <h2>摄像头详情</h2>
            <p v-if="selectedCamera" class="panel-subtitle">
              当前第 {{ selectedCameraOrder }} 台，共 {{ cameras.length }} 台，可连续切换上下文。
            </p>
          </div>
          <div class="inline-actions detail-nav-actions">
            <button class="ghost-button" :disabled="!previousCamera" @click="showPreviousCamera">上一台</button>
            <button class="ghost-button" :disabled="!nextCamera" @click="showNextCamera">下一台</button>
            <span class="tag tag-p2">{{ selectedCamera?.cameraCode || "未选择" }}</span>
          </div>
        </div>
        <div v-if="selectedCamera" class="stack">
          <div class="shadow-highlight-grid">
            <div class="detail-card shadow-highlight-card">
              <div class="detail-label">在线状态</div>
              <div class="shadow-highlight-value">{{ enumLabel("onlineStatus", selectedCamera.onlineStatus) }}</div>
              <div class="shadow-highlight-copy">最近在线：{{ formatDateTime(selectedCamera.lastOnlineAt) }}</div>
            </div>
            <div class="detail-card shadow-highlight-card">
              <div class="detail-label">媒体策略</div>
              <div class="shadow-highlight-value">{{ enumLabel("streamProtocol", selectedCamera.streamProtocol) }}</div>
              <div class="shadow-highlight-copy">{{ selectedCamera.snapshotEnabled ? "抓图启用" : "抓图关闭" }} · {{ selectedCamera.recordEnabled ? "录像启用" : "录像关闭" }}</div>
            </div>
          </div>

          <div class="detail-grid">
            <div>
              <div class="detail-label">抓图模式</div>
              <div class="detail-value">{{ enumLabel("captureMode", selectedCamera.captureMode) }}</div>
            </div>
            <div>
              <div class="detail-label">安装位置</div>
              <div class="detail-value">{{ selectedCamera.installPosition || "-" }}</div>
            </div>
            <div class="detail-span">
              <div class="detail-label">源流地址</div>
              <div class="detail-value">{{ selectedCamera.sourceUrl || "-" }}</div>
            </div>
            <div class="detail-span">
              <div class="detail-label">转出地址</div>
              <div class="detail-value">{{ selectedCamera.targetUrl || "-" }}</div>
            </div>
            <div class="detail-span">
              <div class="detail-label">备注</div>
              <div class="detail-value">{{ selectedCamera.remark || "-" }}</div>
            </div>
          </div>

          <article class="detail-card camera-diagnostics-card">
            <div class="camera-diagnostics-head">
              <div>
                <div class="detail-label">配置自检</div>
                <div class="detail-value">{{ cameraDiagnosticSummary }}</div>
              </div>
              <span class="camera-diagnostics-score">{{ cameraDiagnosticScore.ok }}/{{ cameraDiagnosticScore.total }}</span>
            </div>
            <div class="camera-diagnostic-list">
              <div
                v-for="item in cameraDiagnosticItems"
                :key="item.key"
                class="camera-diagnostic-item"
                :class="`camera-diagnostic-item-${item.status}`"
              >
                <span class="tag" :class="diagnosticTagClass(item.status)">{{ diagnosticStatusLabel(item.status) }}</span>
                <div>
                  <strong>{{ item.label }}</strong>
                  <p>{{ item.description }}</p>
                </div>
              </div>
            </div>
          </article>

          <div class="dashboard-workspace-grid ops-workspace-grid">
            <article class="detail-card dashboard-workspace-card camera-live-card">
              <div class="detail-label">实时预览</div>
              <div class="dashboard-workspace-copy">
                <span>{{ livePreviewLabel }}</span>
              </div>
              <div class="dashboard-workspace-actions">
                <button
                  v-if="selectedCameraPreviewSupported"
                  class="ghost-button"
                  type="button"
                  @click="toggleLivePreview"
                >
                  {{ livePreviewVisible ? "收起预览" : "页内预览" }}
                </button>
                <a
                  v-if="selectedCameraPlayUrl"
                  :href="selectedCameraPlayUrl"
                  class="dashboard-mini-link"
                  target="_blank"
                  rel="noreferrer"
                >
                  打开回放
                </a>
              </div>
              <div v-if="livePreviewVisible" class="camera-live-player">
                <video
                  ref="desktopLiveVideoRef"
                  class="camera-live-video"
                  controls
                  playsinline
                  muted
                  autoplay
                />
              </div>
              <div v-if="livePreviewError" class="error-text inline-error">{{ livePreviewError }}</div>
            </article>

            <article class="detail-card dashboard-workspace-card">
              <div class="detail-label">流地址操作</div>
              <div class="dashboard-workspace-copy">
                <span v-if="selectedCamera.sourceUrl">源流已登记，可直接复制给排障同事或媒体节点。</span>
                <span v-else>当前还没有登记源流地址。</span>
                <span v-if="selectedCamera.targetUrl">转出地址已登记，可直接打开外部回放链路。</span>
              </div>
              <div class="dashboard-workspace-actions">
                <button class="ghost-button" type="button" @click="copySelectedCameraText(selectedCamera.sourceUrl, '源流地址')" :disabled="!selectedCamera.sourceUrl">
                  复制源流地址
                </button>
                <button class="ghost-button" type="button" @click="copySelectedCameraText(selectedCamera.targetUrl, '转出地址')" :disabled="!selectedCamera.targetUrl">
                  复制转出地址
                </button>
                <a v-if="isHttpUrl(selectedCamera.targetUrl)" :href="selectedCamera.targetUrl" class="dashboard-mini-link" target="_blank" rel="noreferrer">
                  打开转出地址
                </a>
              </div>
            </article>

            <article class="detail-card dashboard-workspace-card camera-access-card">
              <div class="camera-access-head">
                <div>
                  <div class="detail-label">接入参数</div>
                  <div class="dashboard-workspace-copy">
                    <span>给摄像头 Web 后台、现场同事或媒体节点使用，按当前摄像头和媒体节点自动生成。</span>
                  </div>
                </div>
                <button class="ghost-button" type="button" @click="copyCameraAccessParams">复制全部</button>
              </div>
              <pre class="camera-access-snippet">{{ cameraAccessParameterText }}</pre>
            </article>

            <article class="detail-card dashboard-workspace-card">
              <div class="detail-label">现场联动</div>
              <div class="dashboard-workspace-copy">
                <span>从当前摄像头快速进入抓图计划、图片时间轴和设备列表，不用来回切菜单。</span>
              </div>
              <div class="dashboard-workspace-actions">
                <RouterLink :to="cameraCapturePlansRoute" class="dashboard-mini-link">抓图计划</RouterLink>
                <RouterLink :to="cameraTimelineRoute" class="dashboard-mini-link">图片时间轴</RouterLink>
                <RouterLink to="/devices/media-nodes" class="dashboard-mini-link">媒体节点</RouterLink>
              </div>
            </article>
          </div>

          <div v-if="canRevealUploadUrl" class="stack">
            <div class="detail-card">
              <div class="detail-label">HTTP(S) 推送地址</div>
              <div class="detail-value">{{ cameraUploadUrl || "点击下方按钮生成当前摄像头上传地址" }}</div>
              <div class="inline-actions">
                <button class="ghost-button" @click="revealCameraUploadUrl" :disabled="revealingUploadUrl">
                  {{ revealingUploadUrl ? "生成中..." : "生成上传地址" }}
                </button>
                <button class="ghost-button" @click="copyCameraUploadUrl" :disabled="!cameraUploadUrl">
                  复制地址
                </button>
              </div>
            </div>
            <div class="detail-card">
              <div class="detail-label">配置说明</div>
              <div class="detail-value">用于摄像头“HTTP(S) 推送图片”模式，直接把该地址填到摄像头的服务器地址中即可。</div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">从列表选择一个摄像头查看详情。</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import Hls from "hls.js";
import { apiRequest, buildQuery } from "../lib/api";
import { enumLabel } from "../lib/enum-display";
import { formatDateTime } from "../lib/format";
import { hasPermission } from "../lib/session";

const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const message = ref("");
const cameras = ref([]);
const areas = ref([]);
const gateways = ref([]);
const mediaNodes = ref([]);
const selectedCamera = ref(null);
const editingCameraId = ref(null);
const revealingUploadUrl = ref(false);
const cameraUploadToken = ref("");
const latestCameraSnapshot = ref(null);
const latestSnapshotLoading = ref(false);
const capturingNow = ref(false);
const cameraFormStage = ref("profile");
const mobileFiltersOpen = ref(false);
const livePreviewVisible = ref(false);
const livePreviewError = ref("");
const desktopLiveVideoRef = ref(null);
const mobileLiveVideoRef = ref(null);
let desktopHls = null;
let mobileHls = null;

const CAMERA_FORM_STAGES = [
  { code: "profile", label: "1. 设备档案" },
  { code: "network", label: "2. 所属与位置" },
  { code: "stream", label: "3. 流地址与推图" },
  { code: "media", label: "4. 抓图与录像" }
];

const filters = reactive({
  keyword: "",
  areaId: "",
  onlineStatus: ""
});

const form = reactive({
  cameraCode: "",
  cameraName: "",
  cameraType: "ip_camera",
  vendorName: "",
  modelName: "",
  serialNo: "",
  gatewayId: "",
  areaId: "",
  mediaNodeId: "",
  ipAddress: "",
  macAddress: "",
  wifiSsid: "",
  installPosition: "",
  orientationText: "",
  captureMode: "manual",
  streamProtocol: "rtsp",
  sourceUrl: "",
  targetUrl: "",
  streamUsername: "",
  streamPassword: "",
  snapshotEnabled: true,
  recordEnabled: false,
  status: "enabled",
  remark: ""
});

const canCreate = hasPermission("device:add");
const canEdit = hasPermission("device:edit");
const canDelete = hasPermission("device:delete");
const canRevealUploadUrl = hasPermission("system:config");
const onlineCameraCount = computed(() => cameras.value.filter((item) => item.onlineStatus === "online").length);
const snapshotEnabledCount = computed(() => cameras.value.filter((item) => item.snapshotEnabled).length);
const recordEnabledCount = computed(() => cameras.value.filter((item) => item.recordEnabled).length);
const cameraStageStatus = computed(() => ({
  profile: Boolean(form.cameraCode && form.cameraName && form.cameraType),
  network: Boolean(form.areaId && (form.ipAddress || form.gatewayId || form.mediaNodeId)),
  stream: Boolean(form.streamProtocol && form.sourceUrl),
  media: Boolean(form.captureMode && (form.snapshotEnabled || form.recordEnabled || form.remark))
}));
const completedCameraStageCount = computed(() => Object.values(cameraStageStatus.value).filter(Boolean).length);
const cameraStageProgressPercent = computed(() =>
  Math.round((completedCameraStageCount.value / CAMERA_FORM_STAGES.length) * 100)
);
const selectedCameraIndex = computed(() =>
  selectedCamera.value?.id ? cameras.value.findIndex((item) => item.id === selectedCamera.value.id) : -1
);
const selectedCameraOrder = computed(() => (selectedCameraIndex.value >= 0 ? selectedCameraIndex.value + 1 : 0));
const previousCamera = computed(() =>
  selectedCameraIndex.value > 0 ? cameras.value[selectedCameraIndex.value - 1] : null
);
const nextCamera = computed(() =>
  selectedCameraIndex.value >= 0 && selectedCameraIndex.value < cameras.value.length - 1
    ? cameras.value[selectedCameraIndex.value + 1]
    : null
);
const selectedMediaNode = computed(() => {
  if (!selectedCamera.value?.mediaNodeId) {
    return null;
  }
  return mediaNodes.value.find((item) => String(item.id) === String(selectedCamera.value.mediaNodeId)) || null;
});
const cameraProgressSummary = computed(() => {
  if (completedCameraStageCount.value === CAMERA_FORM_STAGES.length) {
    return "当前摄像头档案已经完整，可以直接保存。";
  }
  const nextStage = CAMERA_FORM_STAGES.find((stage) => !cameraStageStatus.value[stage.code]);
  return nextStage ? `下一步建议补齐：${nextStage.label}` : "继续完善缺失字段。";
});
const route = useRoute();
const router = useRouter();

const cameraUploadUrl = computed(() => {
  if (!selectedCamera.value?.cameraCode || !cameraUploadToken.value) {
    return "";
  }
  const baseUrl = window.location.origin.replace(/\/+$/g, "");
  const cameraCode = encodeURIComponent(selectedCamera.value.cameraCode);
  const token = encodeURIComponent(cameraUploadToken.value);
  return `${baseUrl}/api/v1/iot/camera-upload/${cameraCode}?token=${token}`;
});
const cameraStreamKey = computed(() => encodeURIComponent(selectedCamera.value?.cameraCode || ""));
const cameraRtmpPushUrl = computed(() => {
  if (!selectedMediaNode.value?.rtmpBaseUrl || !cameraStreamKey.value) {
    return "";
  }
  return joinUrlPath(selectedMediaNode.value.rtmpBaseUrl, cameraStreamKey.value);
});
const cameraHlsPreviewUrl = computed(() => {
  if (!selectedMediaNode.value?.hlsBaseUrl || !cameraStreamKey.value) {
    return "";
  }
  return joinUrlPath(selectedMediaNode.value.hlsBaseUrl, `${cameraStreamKey.value}.m3u8`);
});
const cameraAccessParameterText = computed(() => {
  const camera = selectedCamera.value;
  if (!camera) {
    return "请选择摄像头后生成接入参数。";
  }
  const mediaNode = selectedMediaNode.value;
  const lines = [
    `摄像头：${camera.cameraName || "-"}（${camera.cameraCode || "-"}）`,
    `所属区域：${camera.areaName || "未绑定"}`,
    `媒体节点：${mediaNode?.nodeName || "未绑定"}`,
    `源流协议：${enumLabel("streamProtocol", camera.streamProtocol)}`,
    `源流地址：${camera.sourceUrl || "未配置，平台无法主动拉流"}`,
    `转出地址：${camera.targetUrl || "未配置"}`
  ];

  lines.push("");
  lines.push("RTMP 推流到服务器：");
  lines.push(`RTMP服务器地址：${trimUrl(mediaNode?.rtmpBaseUrl) || "未配置媒体节点 RTMP 地址"}`);
  lines.push(`推流名称/Stream Key：${camera.cameraCode || "未配置摄像头编号"}`);
  lines.push(`完整推流地址：${cameraRtmpPushUrl.value || "未生成"}`);

  lines.push("");
  lines.push("HLS/HTTP 播放预览：");
  lines.push(`HLS预览地址：${cameraHlsPreviewUrl.value || camera.targetUrl || "未配置媒体节点 HLS 地址或转出地址"}`);

  lines.push("");
  lines.push("HTTP(S) 图片推送：");
  lines.push(`推图地址：${cameraUploadUrl.value || "点击“生成上传地址”后显示"}`);

  return lines.join("\n");
});

const selectedCameraPlayUrl = computed(() => {
  if (!selectedCamera.value) {
    return "";
  }
  if (isHttpUrl(selectedCamera.value.targetUrl)) {
    return selectedCamera.value.targetUrl;
  }
  if (isHttpUrl(selectedCamera.value.sourceUrl)) {
    return selectedCamera.value.sourceUrl;
  }
  return "";
});

const selectedCameraPreviewKind = computed(() => {
  const url = selectedCameraPlayUrl.value;
  if (!url) {
    return "";
  }
  if (/\.m3u8(\?|$)/i.test(url)) {
    return "hls";
  }
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
    return "native";
  }
  return "";
});

const selectedCameraPreviewSupported = computed(() => Boolean(selectedCameraPreviewKind.value));
const livePreviewModeLabel = computed(() => {
  if (selectedCameraPreviewKind.value === "hls") {
    return "HLS";
  }
  if (selectedCameraPreviewKind.value === "native") {
    return "原生视频";
  }
  return "外部回放";
});
const livePreviewLabel = computed(() => {
  if (!selectedCameraPlayUrl.value) {
    return "当前还没有可用的回放地址。";
  }
  if (!selectedCameraPreviewSupported.value) {
    return "当前转出地址已登记，但浏览器页内不支持该协议，建议使用外部回放。";
  }
  return `当前预览地址：${selectedCameraPlayUrl.value}`;
});
const cameraDiagnosticItems = computed(() => {
  const camera = selectedCamera.value;
  if (!camera) {
    return [];
  }

  const hasIdentity = Boolean(camera.cameraCode && camera.cameraName);
  const hasArea = Boolean(camera.areaId || camera.areaName);
  const hasNetwork = Boolean(camera.ipAddress || camera.sourceUrl);
  const hasSourceUrl = Boolean(camera.sourceUrl);
  const hasOutput = Boolean(camera.targetUrl || camera.mediaNodeId || camera.mediaNodeName);
  const hasCapturePath = Boolean(camera.snapshotEnabled || camera.captureMode === "manual");
  const hasRecentSnapshot = Boolean(latestCameraSnapshot.value);

  return [
    {
      key: "identity",
      label: "设备档案",
      status: hasIdentity ? "ok" : "error",
      description: hasIdentity
        ? `${camera.cameraCode} / ${camera.cameraName} 已可识别。`
        : "缺少摄像头编号或名称，后续抓图、时间轴和日志会难以定位。"
    },
    {
      key: "area",
      label: "区域绑定",
      status: hasArea ? "ok" : "warning",
      description: hasArea
        ? `已绑定到 ${camera.areaName || "指定区域"}，可进入区域维度统计。`
        : "建议绑定所属区域，否则移动端和时间轴筛选不够准确。"
    },
    {
      key: "network",
      label: "现场地址",
      status: hasNetwork ? "ok" : "warning",
      description: hasNetwork
        ? `已登记 ${camera.ipAddress || "源流地址"}，方便现场排障。`
        : "建议填写摄像头 IP 或源流地址，后续换 WiFi 后也能快速确认。"
    },
    {
      key: "source",
      label: "源流配置",
      status: hasSourceUrl ? "ok" : "error",
      description: hasSourceUrl
        ? `${enumLabel("streamProtocol", camera.streamProtocol)} 源流已登记。`
        : "缺少源流地址，服务器无法按 RTSP/RTMP/HTTP 链路拉流或抓帧。"
    },
    {
      key: "output",
      label: "转出与预览",
      status: hasOutput ? "ok" : "warning",
      description: hasOutput
        ? "已配置媒体节点或转出地址，可用于直播预览和外部回放。"
        : "建议配置媒体节点或 HLS/HTTP 转出地址，浏览器页内预览才更稳定。"
    },
    {
      key: "snapshot",
      label: "抓图闭环",
      status: hasRecentSnapshot ? "ok" : hasCapturePath ? "warning" : "error",
      description: hasRecentSnapshot
        ? `最近已有图片：${formatDateTime(latestCameraSnapshot.value.capturedAt || latestCameraSnapshot.value.receivedAt)}。`
        : hasCapturePath
          ? "抓图入口已具备，建议执行一次“立即抓图”验证图片入库。"
          : "抓图未启用，时间轴不会产生新图片。"
    }
  ];
});
const cameraDiagnosticScore = computed(() => {
  const total = cameraDiagnosticItems.value.length;
  const ok = cameraDiagnosticItems.value.filter((item) => item.status === "ok").length;
  const warning = cameraDiagnosticItems.value.filter((item) => item.status === "warning").length;
  const error = cameraDiagnosticItems.value.filter((item) => item.status === "error").length;
  return { ok, warning, error, total };
});
const cameraDiagnosticSummary = computed(() => {
  if (!cameraDiagnosticScore.value.total) {
    return "请选择摄像头后查看配置完整度。";
  }
  if (cameraDiagnosticScore.value.error > 0) {
    return `有 ${cameraDiagnosticScore.value.error} 项需要处理，优先补齐阻塞项。`;
  }
  if (cameraDiagnosticScore.value.warning > 0) {
    return `主链路可用，还有 ${cameraDiagnosticScore.value.warning} 项建议补齐。`;
  }
  return "配置完整，已具备摄像头接入、预览和抓图闭环。";
});

function resetForm() {
  editingCameraId.value = null;
  cameraFormStage.value = "profile";
  form.cameraCode = "";
  form.cameraName = "";
  form.cameraType = "ip_camera";
  form.vendorName = "";
  form.modelName = "";
  form.serialNo = "";
  form.gatewayId = "";
  form.areaId = "";
  form.mediaNodeId = "";
  form.ipAddress = "";
  form.macAddress = "";
  form.wifiSsid = "";
  form.installPosition = "";
  form.orientationText = "";
  form.captureMode = "manual";
  form.streamProtocol = "rtsp";
  form.sourceUrl = "";
  form.targetUrl = "";
  form.streamUsername = "";
  form.streamPassword = "";
  form.snapshotEnabled = true;
  form.recordEnabled = false;
  form.status = "enabled";
  form.remark = "";
}

async function resetFilters() {
  filters.keyword = "";
  filters.areaId = "";
  filters.onlineStatus = "";
  mobileFiltersOpen.value = false;
  await loadCameras({ preferRouteCamera: false });
  syncRouteQuery({ includeCameraId: false });
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function readNumberQuery(value) {
  const raw = firstQueryValue(value);
  if (raw === undefined || raw === null || raw === "") {
    return "";
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : "";
}

function hydrateFiltersFromRoute() {
  filters.keyword = firstQueryValue(route.query.keyword) || "";
  filters.areaId = readNumberQuery(route.query.areaId);
  filters.onlineStatus = firstQueryValue(route.query.onlineStatus) || "";
}

function buildRouteQuery({ includeCameraId = true } = {}) {
  const query = {};
  if (filters.keyword) query.keyword = String(filters.keyword);
  if (filters.areaId) query.areaId = String(filters.areaId);
  if (filters.onlineStatus) query.onlineStatus = String(filters.onlineStatus);
  if (includeCameraId && selectedCamera.value?.id) query.cameraId = String(selectedCamera.value.id);
  return query;
}

function normalizeQueryValue(value) {
  return value === undefined || value === null ? "" : String(firstQueryValue(value));
}

function syncRouteQuery(options = {}) {
  const query = buildRouteQuery(options);
  const currentQuery = route.query || {};
  const nextKeys = Object.keys(query).sort();
  const currentKeys = Object.keys(currentQuery).sort();

  if (nextKeys.length === currentKeys.length) {
    const changed = nextKeys.some((key, index) => {
      return key !== currentKeys[index] || normalizeQueryValue(currentQuery[key]) !== normalizeQueryValue(query[key]);
    });
    if (!changed) {
      return;
    }
  }

  router.replace({ query }).catch(() => {});
}

async function searchCameras() {
  await loadCameras({ preferRouteCamera: false });
  syncRouteQuery({ includeCameraId: Boolean(selectedCamera.value?.id) });
}

function showDetail(item) {
  selectedCamera.value = item;
  syncRouteQuery();
}

function showPreviousCamera() {
  if (!previousCamera.value) {
    return;
  }
  showDetail(previousCamera.value);
}

function showNextCamera() {
  if (!nextCamera.value) {
    return;
  }
  showDetail(nextCamera.value);
}

function startCreate() {
  resetForm();
  errorMessage.value = "";
  message.value = "";
}

function startEdit(item) {
  cameraFormStage.value = "profile";
  editingCameraId.value = item.id;
  form.cameraCode = item.cameraCode;
  form.cameraName = item.cameraName;
  form.cameraType = item.cameraType || "ip_camera";
  form.vendorName = item.vendorName || "";
  form.modelName = item.modelName || "";
  form.serialNo = item.serialNo || "";
  form.gatewayId = item.gatewayId || "";
  form.areaId = item.areaId || "";
  form.mediaNodeId = item.mediaNodeId || "";
  form.ipAddress = item.ipAddress || "";
  form.macAddress = item.macAddress || "";
  form.wifiSsid = item.wifiSsid || "";
  form.installPosition = item.installPosition || "";
  form.orientationText = item.orientationText || "";
  form.captureMode = item.captureMode || "manual";
  form.streamProtocol = item.streamProtocol || "rtsp";
  form.sourceUrl = item.sourceUrl || "";
  form.targetUrl = item.targetUrl || "";
  form.streamUsername = item.streamUsername || "";
  form.streamPassword = "";
  form.snapshotEnabled = Boolean(item.snapshotEnabled);
  form.recordEnabled = Boolean(item.recordEnabled);
  form.status = item.status || "enabled";
  form.remark = item.remark || "";
  selectedCamera.value = item;
  syncRouteQuery();
}

function scrollToCameraStage(code) {
  cameraFormStage.value = code;
  if (typeof document === "undefined") {
    return;
  }
  const section = document.getElementById(`camera-stage-${code}`);
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadLookups() {
  const [areaRows, gatewayRows, mediaNodeRows] = await Promise.all([
    apiRequest("/api/v1/areas"),
    apiRequest("/api/v1/gateways"),
    apiRequest("/api/v1/media-node-options")
  ]);
  areas.value = areaRows;
  gateways.value = gatewayRows;
  mediaNodes.value = mediaNodeRows;
}

async function loadCameras({ preferRouteCamera = true } = {}) {
  loading.value = true;
  errorMessage.value = "";
  try {
    cameras.value = await apiRequest(`/api/v1/cameras${buildQuery(filters)}`);
    mobileFiltersOpen.value = false;
    const routeCameraId = preferRouteCamera ? readNumberQuery(route.query.cameraId) : "";
    if (routeCameraId) {
      selectedCamera.value = cameras.value.find((item) => item.id === routeCameraId) || cameras.value[0] || null;
    } else if (selectedCamera.value) {
      selectedCamera.value = cameras.value.find((item) => item.id === selectedCamera.value.id) || cameras.value[0] || null;
    } else if (cameras.value[0]) {
      selectedCamera.value = cameras.value[0];
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    loading.value = false;
  }
}

async function loadLatestCameraSnapshot() {
  if (!selectedCamera.value?.id) {
    latestCameraSnapshot.value = null;
    return;
  }

  latestSnapshotLoading.value = true;
  try {
    const rows = await apiRequest(`/api/v1/snapshots${buildQuery({ cameraId: selectedCamera.value.id, limit: 1 })}`);
    latestCameraSnapshot.value = rows[0] || null;
  } catch {
    latestCameraSnapshot.value = null;
  } finally {
    latestSnapshotLoading.value = false;
  }
}

async function saveCamera() {
  if (!(canCreate || canEdit)) {
    return;
  }

  saving.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const payload = {
      ...form,
      gatewayId: form.gatewayId || null,
      areaId: form.areaId || null,
      mediaNodeId: form.mediaNodeId || null
    };

    if (editingCameraId.value) {
      await apiRequest(`/api/v1/cameras/${editingCameraId.value}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      message.value = "摄像头更新成功";
    } else {
      await apiRequest("/api/v1/cameras", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      message.value = "摄像头创建成功";
    }

    await loadCameras();
    resetForm();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    saving.value = false;
  }
}

async function deleteCamera(item) {
  if (!canDelete) {
    return;
  }
  if (!window.confirm(`确认删除摄像头“${item.cameraName}”吗？`)) {
    return;
  }
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/cameras/${item.id}`, {
      method: "DELETE"
    });
    message.value = "摄像头删除成功";
    await loadCameras();
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function revealCameraUploadUrl() {
  if (!selectedCamera.value || !canRevealUploadUrl) {
    return;
  }

  revealingUploadUrl.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const result = await apiRequest("/api/v1/system/device-credentials/reveal", {
      method: "POST",
      body: JSON.stringify({})
    });
    cameraUploadToken.value = result.deviceIngestToken || "";
    message.value = `已生成 ${selectedCamera.value.cameraCode} 的 HTTP 上传地址`;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    revealingUploadUrl.value = false;
  }
}

async function runMobileCapture() {
  if (!selectedCamera.value?.id || !canEdit) {
    return;
  }

  capturingNow.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await apiRequest(`/api/v1/cameras/${selectedCamera.value.id}/capture`, {
      method: "POST",
      body: JSON.stringify({
        capturePurpose: "preview",
        triggerType: "manual",
        triggerSourceType: "user"
      })
    });
    message.value = `已为 ${selectedCamera.value.cameraName} 创建抓图任务`;
    await loadLatestCameraSnapshot();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    capturingNow.value = false;
  }
}

function destroyVideoPlayer(videoRef, hlsInstance) {
  if (hlsInstance) {
    hlsInstance.destroy();
  }
  const video = videoRef.value;
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  return null;
}

function destroyLivePreview() {
  desktopHls = destroyVideoPlayer(desktopLiveVideoRef, desktopHls);
  mobileHls = destroyVideoPlayer(mobileLiveVideoRef, mobileHls);
  livePreviewError.value = "";
}

async function attachLivePreview(videoRef, currentUrl, kind, hlsSlot) {
  const video = videoRef.value;
  if (!video) {
    return hlsSlot;
  }

  video.muted = true;
  video.playsInline = true;

  if (kind === "native") {
    video.src = currentUrl;
    try {
      await video.play();
    } catch {
      // Let controls handle manual play on restricted browsers.
    }
    return hlsSlot;
  }

  if (kind !== "hls") {
    return hlsSlot;
  }

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = currentUrl;
    try {
      await video.play();
    } catch {
      // Let controls handle manual play on restricted browsers.
    }
    return hlsSlot;
  }

  if (!Hls.isSupported()) {
    livePreviewError.value = "当前浏览器不支持页内 HLS 预览，请使用“打开回放”。";
    return hlsSlot;
  }

  const instance = new Hls({
    enableWorker: true,
    lowLatencyMode: true
  });
  instance.on(Hls.Events.ERROR, (_event, data) => {
    if (data?.fatal) {
      livePreviewError.value = "直播预览加载失败，请稍后重试或直接打开回放地址。";
    }
  });
  instance.loadSource(currentUrl);
  instance.attachMedia(video);
  return instance;
}

async function syncLivePreview() {
  destroyLivePreview();

  if (!livePreviewVisible.value || !selectedCameraPlayUrl.value || !selectedCameraPreviewSupported.value) {
    return;
  }

  livePreviewError.value = "";
  await nextTick();
  desktopHls = await attachLivePreview(
    desktopLiveVideoRef,
    selectedCameraPlayUrl.value,
    selectedCameraPreviewKind.value,
    desktopHls
  );
  mobileHls = await attachLivePreview(
    mobileLiveVideoRef,
    selectedCameraPlayUrl.value,
    selectedCameraPreviewKind.value,
    mobileHls
  );
}

function toggleLivePreview() {
  livePreviewVisible.value = !livePreviewVisible.value;
}

async function copyCameraUploadUrl() {
  if (!cameraUploadUrl.value) {
    return;
  }

  try {
    await copyText(cameraUploadUrl.value);
    message.value = "摄像头 HTTP 上传地址已复制到剪贴板";
  } catch {
    errorMessage.value = "复制失败，请手动复制页面中的上传地址";
  }
}

const cameraSelectionQuery = computed(() => {
  const query = {};
  if (selectedCamera.value?.id) query.cameraId = String(selectedCamera.value.id);
  if (selectedCamera.value?.areaId || filters.areaId) {
    query.areaId = String(selectedCamera.value?.areaId || filters.areaId);
  }
  return query;
});

const cameraCapturePlansRoute = computed(() => ({
  path: "/devices/capture-plans",
  query: cameraSelectionQuery.value
}));

const cameraTimelineRoute = computed(() => ({
  path: "/monitor/camera-timeline",
  query: cameraSelectionQuery.value
}));

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function trimUrl(value) {
  return String(value || "").trim().replace(/\/+$/g, "");
}

function joinUrlPath(baseUrl, path) {
  const base = trimUrl(baseUrl);
  const suffix = String(path || "").replace(/^\/+/g, "");
  return base && suffix ? `${base}/${suffix}` : "";
}

function diagnosticStatusLabel(status) {
  if (status === "ok") {
    return "正常";
  }
  if (status === "error") {
    return "需处理";
  }
  return "建议";
}

function diagnosticTagClass(status) {
  if (status === "ok") {
    return "tag-success";
  }
  if (status === "error") {
    return "tag-danger";
  }
  return "tag-warning";
}

async function copyCameraAccessParams() {
  try {
    await copyText(cameraAccessParameterText.value);
    message.value = "摄像头接入参数已复制到剪贴板";
  } catch {
    errorMessage.value = "接入参数复制失败，请手动复制";
  }
}

async function copySelectedCameraText(value, label) {
  if (!value) {
    return;
  }
  try {
    await copyText(value);
    message.value = `${label}已复制到剪贴板`;
  } catch {
    errorMessage.value = `${label}复制失败，请手动复制`;
  }
}

async function copyText(value) {
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

onMounted(async () => {
  await loadLookups();
  hydrateFiltersFromRoute();
  await loadCameras();
});

watch(
  () => selectedCamera.value?.id,
  async () => {
    await loadLatestCameraSnapshot();
    if (livePreviewVisible.value) {
      await syncLivePreview();
    }
  },
  { immediate: true }
);

watch(
  [livePreviewVisible, selectedCameraPlayUrl, selectedCameraPreviewKind],
  async () => {
    await syncLivePreview();
  }
);

onBeforeUnmount(() => {
  destroyLivePreview();
});
</script>
