SET @db_name = DATABASE();

CREATE TABLE IF NOT EXISTS `sys_tenants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '租户主键',
  `tenant_code` VARCHAR(64) NOT NULL COMMENT '租户编码',
  `tenant_name` VARCHAR(128) NOT NULL COMMENT '租户名称',
  `tenant_slug` VARCHAR(128) DEFAULT NULL COMMENT '租户标识',
  `tenant_type` VARCHAR(32) NOT NULL DEFAULT 'enterprise' COMMENT '租户类型：enterprise/trial/internal',
  `status` VARCHAR(32) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled/expired',
  `is_default` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否默认租户',
  `contact_name` VARCHAR(64) DEFAULT NULL COMMENT '联系人',
  `contact_phone` VARCHAR(32) DEFAULT NULL COMMENT '联系电话',
  `contact_email` VARCHAR(128) DEFAULT NULL COMMENT '联系邮箱',
  `expires_at` DATETIME DEFAULT NULL COMMENT '到期时间',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sys_tenants_tenant_code` (`tenant_code`),
  UNIQUE KEY `uk_sys_tenants_tenant_slug` (`tenant_slug`),
  KEY `idx_sys_tenants_status_default` (`status`, `is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户主表';

INSERT INTO `sys_tenants`
  (`tenant_code`, `tenant_name`, `tenant_slug`, `tenant_type`, `status`, `is_default`, `remark`)
VALUES
  ('default', '默认租户', 'default', 'enterprise', 'enabled', 1, '单租户系统升级后的默认租户')
ON DUPLICATE KEY UPDATE
  `tenant_name` = VALUES(`tenant_name`),
  `tenant_slug` = VALUES(`tenant_slug`),
  `tenant_type` = VALUES(`tenant_type`),
  `status` = VALUES(`status`),
  `is_default` = VALUES(`is_default`),
  `remark` = VALUES(`remark`);

SET @default_tenant_id = (
  SELECT id
  FROM sys_tenants
  WHERE tenant_code = 'default'
  ORDER BY id ASC
  LIMIT 1
);

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'sys_users'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `sys_users` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'sys_roles'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `sys_roles` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'sys_data_scopes'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `sys_data_scopes` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'biz_areas'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `biz_areas` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'iot_gateways'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `iot_gateways` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'iot_sensors'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `iot_sensors` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'iot_actuators'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `iot_actuators` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'rule_definitions'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `rule_definitions` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'ops_alerts'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `ops_alerts` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'ops_control_commands'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `ops_control_commands` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'ai_tasks'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `ai_tasks` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'ai_reports'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `ai_reports` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'sys_configs'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `sys_configs` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'iot_media_nodes'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `iot_media_nodes` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'iot_cameras'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `iot_cameras` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `sys_users`
SET `tenant_id` = @default_tenant_id
WHERE `tenant_id` IS NULL;

UPDATE `sys_roles`
SET `tenant_id` = @default_tenant_id
WHERE `tenant_id` IS NULL;

UPDATE `sys_data_scopes`
SET `tenant_id` = @default_tenant_id
WHERE `tenant_id` IS NULL;

UPDATE `biz_areas`
SET `tenant_id` = @default_tenant_id
WHERE `tenant_id` IS NULL;

UPDATE `iot_gateways` g
LEFT JOIN `biz_areas` a ON a.id = g.area_id
SET g.tenant_id = COALESCE(g.tenant_id, a.tenant_id, @default_tenant_id)
WHERE g.tenant_id IS NULL;

UPDATE `iot_sensors` s
LEFT JOIN `iot_gateways` g ON g.id = s.gateway_id
LEFT JOIN `biz_areas` a ON a.id = s.area_id
SET s.tenant_id = COALESCE(s.tenant_id, a.tenant_id, g.tenant_id, @default_tenant_id)
WHERE s.tenant_id IS NULL;

UPDATE `iot_actuators` a
LEFT JOIN `iot_gateways` g ON g.id = a.gateway_id
LEFT JOIN `biz_areas` ar ON ar.id = a.area_id
SET a.tenant_id = COALESCE(a.tenant_id, ar.tenant_id, g.tenant_id, @default_tenant_id)
WHERE a.tenant_id IS NULL;

UPDATE `rule_definitions`
SET `tenant_id` = @default_tenant_id
WHERE `tenant_id` IS NULL;

UPDATE `ops_alerts` al
LEFT JOIN `biz_areas` ar ON ar.id = al.area_id
LEFT JOIN `iot_gateways` g ON g.id = al.gateway_id
LEFT JOIN `iot_sensors` s ON s.id = al.sensor_id
LEFT JOIN `iot_actuators` ac ON ac.id = al.actuator_id
LEFT JOIN `rule_definitions` r ON r.id = al.rule_id
SET al.tenant_id = COALESCE(
  al.tenant_id,
  ar.tenant_id,
  g.tenant_id,
  s.tenant_id,
  ac.tenant_id,
  r.tenant_id,
  @default_tenant_id
)
WHERE al.tenant_id IS NULL;

UPDATE `ops_control_commands` c
LEFT JOIN `biz_areas` ar ON ar.id = c.area_id
LEFT JOIN `iot_gateways` g ON g.id = c.gateway_id
LEFT JOIN `iot_actuators` ac ON ac.id = c.actuator_id
SET c.tenant_id = COALESCE(c.tenant_id, ar.tenant_id, g.tenant_id, ac.tenant_id, @default_tenant_id)
WHERE c.tenant_id IS NULL;

UPDATE `ai_tasks`
SET `tenant_id` = @default_tenant_id
WHERE `tenant_id` IS NULL;

UPDATE `ai_reports` r
LEFT JOIN `ai_tasks` t ON t.id = r.task_id
SET r.tenant_id = COALESCE(r.tenant_id, t.tenant_id, @default_tenant_id)
WHERE r.tenant_id IS NULL;

UPDATE `sys_configs`
SET `tenant_id` = @default_tenant_id
WHERE `tenant_id` IS NULL;

UPDATE `iot_media_nodes`
SET `tenant_id` = @default_tenant_id
WHERE `tenant_id` IS NULL;

UPDATE `iot_cameras` c
LEFT JOIN `biz_areas` a ON a.id = c.area_id
LEFT JOIN `iot_gateways` g ON g.id = c.gateway_id
LEFT JOIN `iot_media_nodes` m ON m.id = c.media_node_id
SET c.tenant_id = COALESCE(c.tenant_id, a.tenant_id, g.tenant_id, m.tenant_id, @default_tenant_id)
WHERE c.tenant_id IS NULL;
