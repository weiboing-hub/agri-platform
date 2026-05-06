SET @db_name = DATABASE();

SET @drop_old_sys_roles_unique_idx := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE sys_roles DROP INDEX uk_sys_roles_role_code',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'sys_roles'
    AND index_name = 'uk_sys_roles_role_code'
);
PREPARE stmt FROM @drop_old_sys_roles_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @create_new_sys_roles_unique_idx := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE sys_roles ADD UNIQUE KEY uk_sys_roles_tenant_role_code (tenant_id, role_code)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'sys_roles'
    AND index_name = 'uk_sys_roles_tenant_role_code'
);
PREPARE stmt FROM @create_new_sys_roles_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @drop_old_biz_areas_unique_idx := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE biz_areas DROP INDEX uk_biz_areas_area_code',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'biz_areas'
    AND index_name = 'uk_biz_areas_area_code'
);
PREPARE stmt FROM @drop_old_biz_areas_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @create_new_biz_areas_unique_idx := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE biz_areas ADD UNIQUE KEY uk_biz_areas_tenant_area_code (tenant_id, area_code)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'biz_areas'
    AND index_name = 'uk_biz_areas_tenant_area_code'
);
PREPARE stmt FROM @create_new_biz_areas_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @drop_old_rule_definitions_unique_idx := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE rule_definitions DROP INDEX uk_rule_definitions_rule_code',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'rule_definitions'
    AND index_name = 'uk_rule_definitions_rule_code'
);
PREPARE stmt FROM @drop_old_rule_definitions_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @create_new_rule_definitions_unique_idx := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE rule_definitions ADD UNIQUE KEY uk_rule_definitions_tenant_rule_code (tenant_id, rule_code)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'rule_definitions'
    AND index_name = 'uk_rule_definitions_tenant_rule_code'
);
PREPARE stmt FROM @create_new_rule_definitions_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
