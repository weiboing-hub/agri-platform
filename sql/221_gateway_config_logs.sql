CREATE TABLE IF NOT EXISTS `iot_gateway_config_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '网关配置日志主键',
  `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID',
  `gateway_id` BIGINT UNSIGNED NOT NULL COMMENT '网关ID',
  `template_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '设备模板ID',
  `config_version` INT NOT NULL DEFAULT 1 COMMENT '配置版本',
  `action_type` VARCHAR(32) NOT NULL COMMENT '动作类型：save_config/mark_applied',
  `sync_status` VARCHAR(32) NOT NULL DEFAULT 'pending_push' COMMENT '同步状态',
  `config_source` VARCHAR(32) NOT NULL DEFAULT 'gateway' COMMENT '配置来源：gateway/template/default',
  `operator_user_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '操作人用户ID',
  `operator_name` VARCHAR(64) DEFAULT NULL COMMENT '操作人名称',
  `message_text` VARCHAR(255) DEFAULT NULL COMMENT '状态说明',
  `config_snapshot_json` JSON DEFAULT NULL COMMENT '配置快照JSON',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_iot_gateway_config_logs_gateway_id` (`gateway_id`, `created_at`),
  KEY `idx_iot_gateway_config_logs_tenant_id` (`tenant_id`, `created_at`),
  KEY `idx_iot_gateway_config_logs_operator_user_id` (`operator_user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='网关配置日志表';

SET @add_iot_gateway_config_logs_gateway_fk := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateway_config_logs'
        AND constraint_name = 'fk_iot_gateway_config_logs_gateway_id'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateway_config_logs` ADD CONSTRAINT `fk_iot_gateway_config_logs_gateway_id` FOREIGN KEY (`gateway_id`) REFERENCES `iot_gateways` (`id`)'
  )
);
PREPARE stmt FROM @add_iot_gateway_config_logs_gateway_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_iot_gateway_config_logs_template_fk := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateway_config_logs'
        AND constraint_name = 'fk_iot_gateway_config_logs_template_id'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateway_config_logs` ADD CONSTRAINT `fk_iot_gateway_config_logs_template_id` FOREIGN KEY (`template_id`) REFERENCES `iot_gateway_templates` (`id`)'
  )
);
PREPARE stmt FROM @add_iot_gateway_config_logs_template_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_iot_gateway_config_logs_operator_fk := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateway_config_logs'
        AND constraint_name = 'fk_iot_gateway_config_logs_operator_user_id'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateway_config_logs` ADD CONSTRAINT `fk_iot_gateway_config_logs_operator_user_id` FOREIGN KEY (`operator_user_id`) REFERENCES `sys_users` (`id`)'
  )
);
PREPARE stmt FROM @add_iot_gateway_config_logs_operator_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_iot_gateway_config_logs_tenant_fk := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND table_name = 'iot_gateway_config_logs'
        AND constraint_name = 'fk_iot_gateway_config_logs_tenant_id'
    ),
    'SELECT 1',
    'ALTER TABLE `iot_gateway_config_logs` ADD CONSTRAINT `fk_iot_gateway_config_logs_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`)'
  )
);
PREPARE stmt FROM @add_iot_gateway_config_logs_tenant_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
