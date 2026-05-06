USE `agri_iot_platform_dev`;

INSERT INTO `sys_tenants`
  (`tenant_code`, `tenant_name`, `tenant_slug`, `tenant_type`, `status`, `is_default`, `remark`)
VALUES
  ('default', '默认租户', 'default', 'enterprise', 'enabled', 1, '单租户模式下的默认租户')
ON DUPLICATE KEY UPDATE
  `tenant_name` = VALUES(`tenant_name`),
  `tenant_slug` = VALUES(`tenant_slug`),
  `tenant_type` = VALUES(`tenant_type`),
  `status` = VALUES(`status`),
  `is_default` = VALUES(`is_default`),
  `remark` = VALUES(`remark`);

INSERT INTO `sys_roles` (`tenant_id`, `role_code`, `role_name`, `role_level`, `status`, `description`)
VALUES
  ((SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1), 'super_admin', '超级管理员', 1, 'enabled', '拥有平台全部权限'),
  ((SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1), 'platform_admin', '平台管理员', 10, 'enabled', '平台日常管理权限'),
  ((SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1), 'ops_engineer', '运维工程师', 20, 'enabled', '设备维护、控制、告警处理'),
  ((SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1), 'technician', '技术员', 30, 'enabled', '巡检、测试、校准'),
  ((SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1), 'supervisor', '主管', 40, 'enabled', '看板、报表、部分控制'),
  ((SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1), 'observer', '观察者', 50, 'enabled', '只读查看用户')
ON DUPLICATE KEY UPDATE
  `tenant_id` = VALUES(`tenant_id`),
  `role_name` = VALUES(`role_name`),
  `role_level` = VALUES(`role_level`),
  `status` = VALUES(`status`),
  `description` = VALUES(`description`);

INSERT INTO `sys_data_scopes` (`tenant_id`, `scope_code`, `scope_name`, `scope_type`, `target_type`, `target_id`, `description`)
VALUES
  ((SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1), 'all_areas', '全部区域', 'all', 'area', NULL, '可访问全部区域数据'),
  ((SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1), 'owner_areas', '本人负责区域', 'owner', 'area', NULL, '仅访问本人负责区域')
ON DUPLICATE KEY UPDATE
  `tenant_id` = VALUES(`tenant_id`),
  `scope_name` = VALUES(`scope_name`),
  `scope_type` = VALUES(`scope_type`),
  `target_type` = VALUES(`target_type`),
  `target_id` = VALUES(`target_id`),
  `description` = VALUES(`description`);

INSERT INTO `sys_permissions` (`permission_code`, `permission_name`, `module_code`, `permission_type`, `route_path`, `description`)
VALUES
  ('dashboard:view', '查看总览大屏', 'dashboard', 'page', '/dashboard/overview', '查看工作台总览'),
  ('monitor:view', '查看实时监控', 'monitor', 'page', '/monitor/realtime', '查看实时监控数据'),
  ('history:view', '查看历史分析', 'history', 'page', '/monitor/history', '查看历史分析数据'),
  ('alert:view', '查看告警中心', 'alerts', 'page', '/alerts/center', '查看告警中心'),
  ('ai:view', '查看智能分析', 'ai', 'page', '/ai/diagnosis', '查看AI诊断与报告'),
  ('device:view', '查看设备中心', 'device_center', 'page', '/devices/areas', '查看区域、网关、传感器、执行器与摄像头'),
  ('control:view', '查看控制记录', 'controls', 'page', '/controls/logs', '查看控制命令与执行记录'),
  ('area:add', '新增区域', 'areas', 'button', NULL, '新增区域'),
  ('area:edit', '编辑区域', 'areas', 'button', NULL, '编辑区域'),
  ('area:delete', '删除区域', 'areas', 'button', NULL, '删除区域'),
  ('device:add', '新增网关设备', 'gateways', 'button', NULL, '新增网关设备'),
  ('device:edit', '编辑网关设备', 'gateways', 'button', NULL, '编辑网关设备'),
  ('device:delete', '删除网关设备', 'gateways', 'button', NULL, '删除网关设备'),
  ('sensor:edit', '编辑传感器', 'sensors', 'button', NULL, '编辑传感器'),
  ('sensor:calibrate', '校准传感器', 'sensors', 'button', NULL, '校准传感器'),
  ('sensor:test_read', '测试读取传感器', 'sensors', 'button', NULL, '测试读取传感器'),
  ('actuator:control', '手动控制执行器', 'actuators', 'button', NULL, '普通手动控制'),
  ('actuator:force_control', '强制控制执行器', 'actuators', 'button', NULL, '高危强制控制'),
  ('actuator:emergency_stop', '执行器紧急停止', 'actuators', 'button', NULL, '紧急停止'),
  ('control:batch', '批量控制', 'controls', 'button', NULL, '批量控制执行器'),
  ('mode:switch', '切换手动自动模式', 'controls', 'button', NULL, '切换执行模式'),
  ('gateway:reboot', '远程重启网关', 'gateways', 'button', NULL, '远程重启网关'),
  ('gateway:params_push', '下发网关参数', 'gateways', 'button', NULL, '下发网关参数'),
  ('gateway:backfill_trigger', '触发立即补传', 'gateways', 'button', NULL, '触发离线缓存补传'),
  ('gateway:cache_clear', '清理网关缓存', 'gateways', 'button', NULL, '清理异常缓存'),
  ('gateway:firmware_upgrade', '固件升级', 'gateways', 'button', NULL, '网关固件升级'),
  ('alert:assign', '指派告警', 'alerts', 'button', NULL, '指派告警处理人'),
  ('alert:confirm', '确认告警', 'alerts', 'button', NULL, '确认告警'),
  ('alert:process', '处理告警', 'alerts', 'button', NULL, '开始处理或挂起告警'),
  ('alert:close', '关闭告警', 'alerts', 'button', NULL, '关闭告警'),
  ('alert:reopen', '重新打开告警', 'alerts', 'button', NULL, '重开告警'),
  ('rule:view', '查看规则引擎', 'rules', 'page', '/rules/engine', '查看规则引擎'),
  ('rule:edit', '编辑规则', 'rules', 'button', NULL, '编辑规则'),
  ('rule:advanced_edit', '高级模式编辑规则', 'rules', 'button', NULL, '高级表达式模式编辑'),
  ('ai:trigger', '发起AI分析', 'ai', 'button', NULL, '手动触发AI任务'),
  ('ai:report_generate', '生成AI报告', 'ai', 'button', NULL, '生成日报周报'),
  ('ai:report_export', '导出AI报告', 'ai', 'button', NULL, '导出AI报告'),
  ('tenant:manage', '租户管理', 'system', 'page', '/system/tenants', '管理租户主档与默认租户'),
  ('user:manage', '用户管理', 'system', 'page', '/system/users', '管理系统用户'),
  ('role:manage', '角色管理', 'system', 'page', '/system/roles', '管理角色'),
  ('permission:manage', '权限管理', 'system', 'page', '/system/permissions', '管理权限'),
  ('system:config', '系统设置', 'system', 'page', '/system/settings', '管理系统设置'),
  ('audit:view', '查看操作日志', 'system', 'page', '/system/audit-logs', '查看操作日志')
ON DUPLICATE KEY UPDATE
  `permission_name` = VALUES(`permission_name`),
  `module_code` = VALUES(`module_code`),
  `permission_type` = VALUES(`permission_type`),
  `route_path` = VALUES(`route_path`),
  `description` = VALUES(`description`);

INSERT INTO `sys_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `sys_roles` r
JOIN `sys_permissions` p
WHERE r.role_code = 'super_admin'
  AND r.tenant_id = (SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1)
ON DUPLICATE KEY UPDATE `permission_id` = VALUES(`permission_id`);

INSERT INTO `sys_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `sys_roles` r
JOIN `sys_permissions` p
WHERE r.role_code = 'platform_admin'
  AND r.tenant_id = (SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1)
  AND p.permission_code NOT IN ('actuator:force_control', 'gateway:cache_clear', 'tenant:manage')
ON DUPLICATE KEY UPDATE `permission_id` = VALUES(`permission_id`);

INSERT INTO `sys_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `sys_roles` r
JOIN `sys_permissions` p
WHERE r.role_code = 'ops_engineer'
  AND r.tenant_id = (SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1)
  AND p.permission_code IN (
    'dashboard:view', 'monitor:view', 'history:view', 'alert:view', 'ai:view', 'device:view', 'control:view',
    'device:edit', 'sensor:edit', 'sensor:calibrate', 'sensor:test_read',
    'actuator:control', 'actuator:emergency_stop', 'mode:switch',
    'gateway:reboot', 'gateway:params_push', 'gateway:backfill_trigger',
    'alert:assign', 'alert:confirm', 'alert:process', 'alert:close', 'alert:reopen',
    'rule:view', 'rule:edit', 'ai:trigger', 'ai:report_generate', 'ai:report_export'
  )
ON DUPLICATE KEY UPDATE `permission_id` = VALUES(`permission_id`);

INSERT INTO `sys_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `sys_roles` r
JOIN `sys_permissions` p
WHERE r.role_code = 'technician'
  AND r.tenant_id = (SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1)
  AND p.permission_code IN (
    'dashboard:view', 'monitor:view', 'history:view', 'alert:view', 'ai:view', 'device:view',
    'sensor:calibrate', 'sensor:test_read', 'rule:view', 'ai:trigger'
  )
ON DUPLICATE KEY UPDATE `permission_id` = VALUES(`permission_id`);

INSERT INTO `sys_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `sys_roles` r
JOIN `sys_permissions` p
WHERE r.role_code = 'supervisor'
  AND r.tenant_id = (SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1)
  AND p.permission_code IN (
    'dashboard:view', 'monitor:view', 'history:view', 'alert:view', 'ai:view', 'control:view',
    'ai:report_export'
  )
ON DUPLICATE KEY UPDATE `permission_id` = VALUES(`permission_id`);

INSERT INTO `sys_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `sys_roles` r
JOIN `sys_permissions` p
WHERE r.role_code = 'observer'
  AND r.tenant_id = (SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1)
  AND p.permission_code IN (
    'dashboard:view', 'monitor:view', 'history:view', 'alert:view', 'ai:view'
  )
ON DUPLICATE KEY UPDATE `permission_id` = VALUES(`permission_id`);

INSERT INTO `sys_role_data_scopes` (`role_id`, `data_scope_id`)
SELECT r.id, s.id
FROM `sys_roles` r
JOIN `sys_data_scopes` s ON s.scope_code = 'all_areas'
WHERE r.role_code IN ('super_admin', 'platform_admin', 'ops_engineer', 'technician', 'supervisor', 'observer')
  AND r.tenant_id = (SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1)
  AND s.tenant_id = (SELECT id FROM `sys_tenants` WHERE `tenant_code` = 'default' LIMIT 1)
ON DUPLICATE KEY UPDATE `data_scope_id` = VALUES(`data_scope_id`);
