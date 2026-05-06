import { createRouter, createWebHistory, type RouteLocationNormalized } from "vue-router";
import { canAccessModule, findModuleByPath, flatModules, getFirstAccessiblePath } from "../config/modules";
import { loadSession } from "../lib/session";
import AdminLayout from "../layouts/AdminLayout.vue";

type LazyViewFactory = () => Promise<unknown>;

const viewModules = import.meta.glob("../views/*.vue") as Record<string, LazyViewFactory>;

function lazyView(name: string): LazyViewFactory {
  return viewModules[`../views/${name}.vue`];
}

function getPreferredAccessiblePath(permissionCodes: string[] = []): string {
  const fallbackPath = getFirstAccessiblePath(permissionCodes);
  const isMobileViewport = typeof window !== "undefined" && window.innerWidth <= 720;
  const dashboardModule = findModuleByPath("/dashboard/overview");

  if (isMobileViewport && dashboardModule && canAccessModule(dashboardModule, permissionCodes)) {
    return "/dashboard/overview";
  }

  return fallbackPath;
}

const moduleViewFallback = lazyView("ModuleView");

const routeComponentMap: Record<string, LazyViewFactory | undefined> = {
  dashboard_overview: lazyView("DashboardView"),
  monitor_realtime: lazyView("MonitorRealtimeView"),
  monitor_history: lazyView("MonitorHistoryView"),
  camera_timeline: lazyView("CameraTimelineView"),
  areas: lazyView("AreasView"),
  gateways: lazyView("GatewaysView"),
  firmware_packages: lazyView("FirmwarePackagesView"),
  firmware_jobs: lazyView("FirmwareJobsView"),
  gateway_templates: lazyView("DeviceTemplatesView"),
  sensors: lazyView("SensorsView"),
  actuators: lazyView("ActuatorsView"),
  media_nodes: lazyView("MediaNodesView"),
  cameras: lazyView("CamerasView"),
  capture_plans: lazyView("CapturePlansView"),
  capture_jobs: lazyView("CaptureJobsView"),
  device_shadow: lazyView("DeviceShadowView"),
  manual_control: lazyView("ManualControlView"),
  automation_policy: lazyView("AutomationPoliciesView"),
  control_logs: lazyView("ControlLogsView"),
  rule_engine: lazyView("RulesEngineView"),
  alert_center: lazyView("AlertsView"),
  notification_logs: lazyView("NotificationsView"),
  ai_diagnosis: lazyView("AiDiagnosisView"),
  ai_reports: lazyView("AiReportsView"),
  crop_knowledge: lazyView("CropKnowledgeView"),
  ai_tasks: lazyView("AiTasksView"),
  tenants: lazyView("TenantsView"),
  users: lazyView("UsersView"),
  roles: lazyView("RolesView"),
  permissions: lazyView("PermissionsView"),
  audit_logs: lazyView("AuditLogsView"),
  system_health: lazyView("SystemHealthView"),
  device_credentials: lazyView("DeviceCredentialsView"),
  settings: lazyView("SystemSettingsView"),
  metrics_catalog: lazyView("MetricsCatalogView")
};

const moduleRoutes = flatModules.map((module) => ({
  path: module.path,
  name: module.code,
  component: routeComponentMap[module.code] || moduleViewFallback,
  meta: {
    title: module.title,
    permissionCodes: module.permissions || []
  }
}));

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: lazyView("LoginView"),
      meta: {
        title: "登录",
        public: true
      }
    },
    {
      path: "/",
      component: AdminLayout,
      children: [
        {
          path: "",
          redirect: () => getPreferredAccessiblePath(loadSession()?.permissionCodes || [])
        },
        {
          path: "/forbidden",
          name: "forbidden",
          component: lazyView("ForbiddenView"),
          meta: {
            title: "无权限"
          }
        },
        {
          path: "/dashboard",
          redirect: (to) => ({
            path: "/dashboard/overview",
            query: to.query
          })
        },
        {
          path: "/mobile/me",
          name: "mobile_me",
          component: lazyView("MobileMeView"),
          meta: {
            title: "我的",
            purpose: "查看当前账号、租户、主题和高频入口。"
          }
        },
        {
          path: "/mobile/settings",
          name: "mobile_settings",
          component: lazyView("MobileSettingsView"),
          meta: {
            title: "现场设置",
            purpose: "手机端只保留系统配置摘要、联调测试和桌面端跳转。"
          }
        },
        {
          path: "/devices/capture-plans/edit/:planId?",
          name: "capture_plan_mobile_edit",
          component: lazyView("CapturePlanMobileEditView"),
          meta: {
            title: "抓图计划编辑",
            purpose: "手机端独立抓图计划编辑页。"
          }
        },
        ...moduleRoutes
      ]
    }
  ]
});

router.beforeEach((to: RouteLocationNormalized) => {
  const session = loadSession();
  if (to.meta?.public) {
    if (session?.accessToken && to.path === "/login") {
      return getPreferredAccessiblePath(session.permissionCodes || []);
    }
    return true;
  }

  if (!session?.accessToken) {
    return "/login";
  }

  if (to.path === "/" || to.path === "") {
    return getPreferredAccessiblePath(session.permissionCodes || []);
  }

  if (to.path === "/forbidden") {
    return true;
  }

  const module = findModuleByPath(to.path);
  if (module && !canAccessModule(module, session.permissionCodes || [])) {
    const fallbackPath = getPreferredAccessiblePath(session.permissionCodes || []);
    return fallbackPath === to.path ? "/forbidden" : fallbackPath;
  }

  return true;
});

router.afterEach((to: RouteLocationNormalized) => {
  const title = to.meta?.title ? `${String(to.meta.title)} - 智能农业后台` : "智能农业后台";
  document.title = title;
});

export default router;
