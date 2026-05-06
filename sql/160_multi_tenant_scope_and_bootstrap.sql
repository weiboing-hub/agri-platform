SET @db_name = DATABASE();

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'sys_data_scopes'
      AND index_name = 'uk_sys_data_scopes_scope_code'
  ),
  'ALTER TABLE `sys_data_scopes` DROP INDEX `uk_sys_data_scopes_scope_code`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'sys_data_scopes'
      AND index_name = 'uk_sys_data_scopes_tenant_scope_code'
  ),
  'SELECT 1',
  'ALTER TABLE `sys_data_scopes` ADD UNIQUE KEY `uk_sys_data_scopes_tenant_scope_code` (`tenant_id`, `scope_code`)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
