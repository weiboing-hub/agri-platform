CREATE TABLE IF NOT EXISTS `iot_gateway_templates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '设备模板主键',
  `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID',
  `template_code` VARCHAR(64) NOT NULL COMMENT '模板编号',
  `template_name` VARCHAR(128) NOT NULL COMMENT '模板名称',
  `gateway_type` VARCHAR(32) NOT NULL DEFAULT 'esp32' COMMENT '适用网关类型',
  `config_json` JSON NOT NULL COMMENT '模板配置JSON',
  `status` VARCHAR(32) NOT NULL DEFAULT 'enabled' COMMENT '模板状态',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_gateway_templates_tenant_code` (`tenant_id`, `template_code`),
  KEY `idx_iot_gateway_templates_tenant_status` (`tenant_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='网关设备模板表';

SET @add_gateway_templates_tenant_fk := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateway_templates'
        AND constraint_name = 'fk_iot_gateway_templates_tenant_id'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateway_templates` ADD CONSTRAINT `fk_iot_gateway_templates_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`)'
  )
);
PREPARE stmt FROM @add_gateway_templates_tenant_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_iot_gateways_device_template_id := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateways'
        AND column_name = 'device_template_id'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateways` ADD COLUMN `device_template_id` BIGINT UNSIGNED DEFAULT NULL COMMENT ''设备模板ID'' AFTER `firmware_version`'
  )
);
PREPARE stmt FROM @add_iot_gateways_device_template_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_iot_gateways_device_config_json := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateways'
        AND column_name = 'device_config_json'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateways` ADD COLUMN `device_config_json` JSON DEFAULT NULL COMMENT ''设备配置JSON'' AFTER `device_template_id`'
  )
);
PREPARE stmt FROM @add_iot_gateways_device_config_json;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_iot_gateways_device_config_version := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateways'
        AND column_name = 'device_config_version'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateways` ADD COLUMN `device_config_version` INT NOT NULL DEFAULT 1 COMMENT ''设备配置版本'' AFTER `device_config_json`'
  )
);
PREPARE stmt FROM @add_iot_gateways_device_config_version;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_iot_gateways_device_config_sync_status := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateways'
        AND column_name = 'device_config_sync_status'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateways` ADD COLUMN `device_config_sync_status` VARCHAR(32) NOT NULL DEFAULT ''not_configured'' COMMENT ''配置同步状态'' AFTER `device_config_version`'
  )
);
PREPARE stmt FROM @add_iot_gateways_device_config_sync_status;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_iot_gateways_last_config_pushed_at := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateways'
        AND column_name = 'last_config_pushed_at'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateways` ADD COLUMN `last_config_pushed_at` DATETIME DEFAULT NULL COMMENT ''最近配置下发时间'' AFTER `device_config_sync_status`'
  )
);
PREPARE stmt FROM @add_iot_gateways_last_config_pushed_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_iot_gateways_last_config_applied_at := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateways'
        AND column_name = 'last_config_applied_at'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateways` ADD COLUMN `last_config_applied_at` DATETIME DEFAULT NULL COMMENT ''最近配置生效时间'' AFTER `last_config_pushed_at`'
  )
);
PREPARE stmt FROM @add_iot_gateways_last_config_applied_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_iot_gateways_device_config_message := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateways'
        AND column_name = 'device_config_message'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateways` ADD COLUMN `device_config_message` VARCHAR(255) DEFAULT NULL COMMENT ''配置状态说明'' AFTER `last_config_applied_at`'
  )
);
PREPARE stmt FROM @add_iot_gateways_device_config_message;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_iot_gateways_template_idx := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateways'
        AND index_name = 'idx_iot_gateways_template_id'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateways` ADD KEY `idx_iot_gateways_template_id` (`device_template_id`)'
  )
);
PREPARE stmt FROM @add_iot_gateways_template_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_iot_gateways_template_fk := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateways'
        AND constraint_name = 'fk_iot_gateways_template_id'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateways` ADD CONSTRAINT `fk_iot_gateways_template_id` FOREIGN KEY (`device_template_id`) REFERENCES `iot_gateway_templates` (`id`)'
  )
);
PREPARE stmt FROM @add_iot_gateways_template_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO `iot_gateway_templates`
  (`tenant_id`, `template_code`, `template_name`, `gateway_type`, `config_json`, `status`, `remark`)
SELECT
  t.id,
  'TPL-ESP32-SOIL-GW',
  'ESP32 土壤监测网关模板',
  'esp32',
  JSON_OBJECT(
    'cloud', JSON_OBJECT(
      'apiHost', 'http://82.156.45.208',
      'reportIntervalMs', 20000,
      'controlPollIntervalMs', 10000
    ),
    'rs485', JSON_OBJECT(
      'baudrate', 9600,
      'modbusAddress', 2,
      'registerStart', 0,
      'registerCount', 2,
      'tempRegisterIndex', 0,
      'humRegisterIndex', 1
    ),
    'control', JSON_OBJECT(
      'pumpGpio', 26,
      'activeHigh', true,
      'maxRunSeconds', 900,
      'minOffSeconds', 30
    ),
    'capabilities', JSON_OBJECT(
      'localWebEnabled', true,
      'otaEnabled', true,
      'cellularEnabled', false
    )
  ),
  'enabled',
  '首版 ESP32 配置模板'
FROM `sys_tenants` t
WHERE t.tenant_code = 'default'
ON DUPLICATE KEY UPDATE
  `template_name` = VALUES(`template_name`),
  `gateway_type` = VALUES(`gateway_type`),
  `config_json` = VALUES(`config_json`),
  `status` = VALUES(`status`),
  `remark` = VALUES(`remark`);

UPDATE `iot_gateways` g
JOIN `iot_gateway_templates` t
  ON t.tenant_id = g.tenant_id
 AND t.template_code = 'TPL-ESP32-SOIL-GW'
SET
  g.device_template_id = COALESCE(g.device_template_id, t.id),
  g.device_config_json = COALESCE(g.device_config_json, t.config_json),
  g.device_config_version = CASE
    WHEN g.device_config_json IS NULL THEN 1
    ELSE g.device_config_version
  END,
  g.device_config_sync_status = CASE
    WHEN g.device_config_sync_status = 'not_configured' THEN 'pending_push'
    ELSE g.device_config_sync_status
  END,
  g.device_config_message = CASE
    WHEN g.device_config_message IS NULL OR g.device_config_message = '' THEN '已预置默认 ESP32 配置模板'
    ELSE g.device_config_message
  END
WHERE g.gateway_type = 'esp32';
