SET @db_name = DATABASE();

SET @default_tenant_id = (
  SELECT id
  FROM sys_tenants
  WHERE is_default = 1
     OR tenant_code = 'default'
  ORDER BY is_default DESC, id ASC
  LIMIT 1
);

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'ops_notifications'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `ops_notifications` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'sys_operation_logs'
      AND COLUMN_NAME = 'tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `sys_operation_logs` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID' AFTER `id`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE ops_notifications n
LEFT JOIN ops_alerts al ON al.id = n.alert_id
LEFT JOIN ai_tasks t ON t.id = n.task_id
SET n.tenant_id = COALESCE(al.tenant_id, t.tenant_id, @default_tenant_id)
WHERE n.tenant_id IS NULL;

UPDATE sys_operation_logs l
LEFT JOIN sys_users u ON u.id = l.operator_user_id
SET l.tenant_id = COALESCE(u.tenant_id, @default_tenant_id)
WHERE l.tenant_id IS NULL;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'ops_notifications'
      AND index_name = 'idx_ops_notifications_tenant_id'
  ),
  'SELECT 1',
  "ALTER TABLE `ops_notifications` ADD KEY `idx_ops_notifications_tenant_id` (`tenant_id`, `send_status`, `created_at`)"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'sys_operation_logs'
      AND index_name = 'idx_sys_operation_logs_tenant_created_at'
  ),
  'SELECT 1',
  "ALTER TABLE `sys_operation_logs` ADD KEY `idx_sys_operation_logs_tenant_created_at` (`tenant_id`, `created_at`)"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = @db_name
      AND CONSTRAINT_NAME = 'fk_ops_notifications_tenant_id'
      AND TABLE_NAME = 'ops_notifications'
  ),
  'SELECT 1',
  "ALTER TABLE `ops_notifications` ADD CONSTRAINT `fk_ops_notifications_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`)"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = @db_name
      AND CONSTRAINT_NAME = 'fk_sys_operation_logs_tenant_id'
      AND TABLE_NAME = 'sys_operation_logs'
  ),
  'SELECT 1',
  "ALTER TABLE `sys_operation_logs` ADD CONSTRAINT `fk_sys_operation_logs_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`)"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
