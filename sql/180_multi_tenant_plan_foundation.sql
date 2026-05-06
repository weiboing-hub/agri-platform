-- 多租户改造十一期：套餐与订阅底座

CREATE TABLE IF NOT EXISTS `sys_tenant_plans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '套餐主键',
  `plan_code` VARCHAR(64) NOT NULL COMMENT '套餐编码',
  `plan_name` VARCHAR(128) NOT NULL COMMENT '套餐名称',
  `plan_level` INT NOT NULL DEFAULT 100 COMMENT '套餐等级，值越小优先级越高',
  `billing_cycle` VARCHAR(32) NOT NULL DEFAULT 'annual' COMMENT '计费周期：trial/monthly/quarterly/annual/custom',
  `status` VARCHAR(32) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled',
  `description` VARCHAR(255) DEFAULT NULL COMMENT '套餐描述',
  `features_json` JSON DEFAULT NULL COMMENT '默认能力开关JSON',
  `limits_json` JSON DEFAULT NULL COMMENT '默认额度JSON',
  `is_builtin` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否内置套餐',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sys_tenant_plans_plan_code` (`plan_code`),
  KEY `idx_sys_tenant_plans_status_level` (`status`, `plan_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户套餐定义表';

CREATE TABLE IF NOT EXISTS `sys_tenant_subscriptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '租户订阅主键',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '租户ID',
  `plan_id` BIGINT UNSIGNED NOT NULL COMMENT '套餐ID',
  `subscription_status` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '订阅状态：active/paused/expired/cancelled',
  `starts_at` DATETIME DEFAULT NULL COMMENT '开始时间',
  `expires_at` DATETIME DEFAULT NULL COMMENT '到期时间',
  `feature_overrides_json` JSON DEFAULT NULL COMMENT '能力覆盖配置JSON',
  `limit_overrides_json` JSON DEFAULT NULL COMMENT '额度覆盖配置JSON',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT '备注',
  `updated_by` BIGINT UNSIGNED DEFAULT NULL COMMENT '更新人',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sys_tenant_subscriptions_tenant_id` (`tenant_id`),
  KEY `idx_sys_tenant_subscriptions_plan_status` (`plan_id`, `subscription_status`, `expires_at`),
  CONSTRAINT `fk_sys_tenant_subscriptions_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`),
  CONSTRAINT `fk_sys_tenant_subscriptions_plan_id` FOREIGN KEY (`plan_id`) REFERENCES `sys_tenant_plans` (`id`),
  CONSTRAINT `fk_sys_tenant_subscriptions_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `sys_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户套餐订阅表';

INSERT INTO `sys_tenant_plans`
  (`plan_code`, `plan_name`, `plan_level`, `billing_cycle`, `status`, `description`, `features_json`, `limits_json`, `is_builtin`)
VALUES
  (
    'trial',
    '试用版',
    10,
    'trial',
    'enabled',
    '适合演示和短期试用',
    JSON_OBJECT('enable_ai', true, 'enable_media', true, 'enable_openclaw', false, 'enable_alert_notifications', true),
    JSON_OBJECT('max_users', 5, 'max_gateways', 3, 'max_cameras', 2, 'max_ai_tasks_per_day', 20),
    1
  ),
  (
    'standard',
    '标准版',
    20,
    'annual',
    'enabled',
    '适合轻量正式部署',
    JSON_OBJECT('enable_ai', true, 'enable_media', true, 'enable_openclaw', false, 'enable_alert_notifications', true),
    JSON_OBJECT('max_users', 20, 'max_gateways', 10, 'max_cameras', 6, 'max_ai_tasks_per_day', 80),
    1
  ),
  (
    'enterprise',
    '企业版',
    30,
    'annual',
    'enabled',
    '适合正式部署和多角色协作',
    JSON_OBJECT('enable_ai', true, 'enable_media', true, 'enable_openclaw', true, 'enable_alert_notifications', true),
    JSON_OBJECT('max_users', 50, 'max_gateways', 30, 'max_cameras', 20, 'max_ai_tasks_per_day', 200),
    1
  ),
  (
    'internal',
    '内部版',
    40,
    'custom',
    'enabled',
    '平台内部租户使用',
    JSON_OBJECT('enable_ai', true, 'enable_media', true, 'enable_openclaw', true, 'enable_alert_notifications', true),
    JSON_OBJECT('max_users', 200, 'max_gateways', 100, 'max_cameras', 80, 'max_ai_tasks_per_day', 1000),
    1
  )
ON DUPLICATE KEY UPDATE
  `plan_name` = VALUES(`plan_name`),
  `plan_level` = VALUES(`plan_level`),
  `billing_cycle` = VALUES(`billing_cycle`),
  `status` = VALUES(`status`),
  `description` = VALUES(`description`),
  `features_json` = VALUES(`features_json`),
  `limits_json` = VALUES(`limits_json`),
  `is_builtin` = VALUES(`is_builtin`);

INSERT INTO `sys_tenant_subscriptions`
  (`tenant_id`, `plan_id`, `subscription_status`, `starts_at`, `expires_at`, `feature_overrides_json`, `limit_overrides_json`, `remark`, `updated_by`)
SELECT
  t.id,
  p.id,
  'active',
  NOW(),
  t.expires_at,
  NULL,
  NULL,
  CONCAT('系统补齐默认套餐：', p.plan_name),
  NULL
FROM `sys_tenants` t
JOIN `sys_tenant_plans` p
  ON p.plan_code = CASE
    WHEN t.is_default = 1 OR t.tenant_code = 'default' THEN 'internal'
    WHEN t.tenant_type = 'trial' THEN 'trial'
    WHEN t.tenant_type = 'internal' THEN 'internal'
    ELSE 'standard'
  END
WHERE NOT EXISTS (
  SELECT 1
  FROM `sys_tenant_subscriptions` s
  WHERE s.tenant_id = t.id
);
