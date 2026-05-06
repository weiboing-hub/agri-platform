USE `agri_iot_platform_dev`;

INSERT INTO `sys_permissions` (`permission_code`, `permission_name`, `module_code`, `permission_type`, `route_path`, `description`)
VALUES
  ('device:view', '查看设备中心', 'device_center', 'page', '/devices/areas', '查看区域、网关、传感器、执行器与摄像头'),
  ('control:view', '查看控制记录', 'controls', 'page', '/controls/logs', '查看控制命令与执行记录')
ON DUPLICATE KEY UPDATE
  `permission_name` = VALUES(`permission_name`),
  `module_code` = VALUES(`module_code`),
  `permission_type` = VALUES(`permission_type`),
  `route_path` = VALUES(`route_path`),
  `description` = VALUES(`description`);

INSERT INTO `sys_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `sys_roles` r
JOIN `sys_permissions` p ON p.permission_code = 'device:view'
WHERE r.role_code IN ('super_admin', 'platform_admin', 'ops_engineer', 'technician')
ON DUPLICATE KEY UPDATE `permission_id` = VALUES(`permission_id`);

INSERT INTO `sys_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `sys_roles` r
JOIN `sys_permissions` p ON p.permission_code = 'control:view'
WHERE r.role_code IN ('super_admin', 'platform_admin', 'ops_engineer', 'supervisor')
ON DUPLICATE KEY UPDATE `permission_id` = VALUES(`permission_id`);
