SET @default_tenant_id := (
  SELECT id
  FROM sys_tenants
  WHERE is_default = 1
     OR tenant_code = 'default'
  ORDER BY is_default DESC, id ASC
  LIMIT 1
);

UPDATE sys_configs
SET tenant_id = @default_tenant_id
WHERE tenant_id IS NULL
  AND @default_tenant_id IS NOT NULL;

SET @drop_old_sys_configs_unique_idx := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE sys_configs DROP INDEX uk_sys_configs_group_key',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'sys_configs'
    AND index_name = 'uk_sys_configs_group_key'
);
PREPARE stmt_drop_old_sys_configs_unique_idx FROM @drop_old_sys_configs_unique_idx;
EXECUTE stmt_drop_old_sys_configs_unique_idx;
DEALLOCATE PREPARE stmt_drop_old_sys_configs_unique_idx;

SET @create_new_sys_configs_unique_idx := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE sys_configs ADD UNIQUE KEY uk_sys_configs_tenant_group_key (tenant_id, config_group, config_key)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'sys_configs'
    AND index_name = 'uk_sys_configs_tenant_group_key'
);
PREPARE stmt_create_new_sys_configs_unique_idx FROM @create_new_sys_configs_unique_idx;
EXECUTE stmt_create_new_sys_configs_unique_idx;
DEALLOCATE PREPARE stmt_create_new_sys_configs_unique_idx;
