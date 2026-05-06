SET @db_name = DATABASE();

SET @default_tenant_id = (
  SELECT id
  FROM sys_tenants
  WHERE tenant_code = 'default'
  ORDER BY is_default DESC, id ASC
  LIMIT 1
);

UPDATE iot_gateways
SET tenant_id = COALESCE(tenant_id, @default_tenant_id)
WHERE tenant_id IS NULL;

UPDATE iot_sensors s
LEFT JOIN iot_gateways g ON g.id = s.gateway_id
SET s.tenant_id = COALESCE(s.tenant_id, g.tenant_id, @default_tenant_id)
WHERE s.tenant_id IS NULL;

UPDATE iot_actuators a
LEFT JOIN iot_gateways g ON g.id = a.gateway_id
LEFT JOIN biz_areas area_ref ON area_ref.id = a.area_id
SET a.tenant_id = COALESCE(a.tenant_id, g.tenant_id, area_ref.tenant_id, @default_tenant_id)
WHERE a.tenant_id IS NULL;

UPDATE iot_media_nodes
SET tenant_id = COALESCE(tenant_id, @default_tenant_id)
WHERE tenant_id IS NULL;

UPDATE iot_cameras c
LEFT JOIN iot_gateways g ON g.id = c.gateway_id
LEFT JOIN biz_areas area_ref ON area_ref.id = c.area_id
LEFT JOIN iot_media_nodes m ON m.id = c.media_node_id
SET c.tenant_id = COALESCE(c.tenant_id, g.tenant_id, area_ref.tenant_id, m.tenant_id, @default_tenant_id)
WHERE c.tenant_id IS NULL;

SET @drop_old_iot_gateways_unique_idx := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE iot_gateways DROP INDEX uk_iot_gateways_gateway_code',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'iot_gateways'
    AND index_name = 'uk_iot_gateways_gateway_code'
);
PREPARE stmt FROM @drop_old_iot_gateways_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @create_new_iot_gateways_unique_idx := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE iot_gateways ADD UNIQUE KEY uk_iot_gateways_tenant_gateway_code (tenant_id, gateway_code)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'iot_gateways'
    AND index_name = 'uk_iot_gateways_tenant_gateway_code'
);
PREPARE stmt FROM @create_new_iot_gateways_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @drop_old_iot_sensors_unique_idx := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE iot_sensors DROP INDEX uk_iot_sensors_sensor_code',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'iot_sensors'
    AND index_name = 'uk_iot_sensors_sensor_code'
);
PREPARE stmt FROM @drop_old_iot_sensors_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @create_new_iot_sensors_unique_idx := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE iot_sensors ADD UNIQUE KEY uk_iot_sensors_tenant_sensor_code (tenant_id, sensor_code)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'iot_sensors'
    AND index_name = 'uk_iot_sensors_tenant_sensor_code'
);
PREPARE stmt FROM @create_new_iot_sensors_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @drop_old_iot_actuators_unique_idx := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE iot_actuators DROP INDEX uk_iot_actuators_actuator_code',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'iot_actuators'
    AND index_name = 'uk_iot_actuators_actuator_code'
);
PREPARE stmt FROM @drop_old_iot_actuators_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @create_new_iot_actuators_unique_idx := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE iot_actuators ADD UNIQUE KEY uk_iot_actuators_tenant_actuator_code (tenant_id, actuator_code)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'iot_actuators'
    AND index_name = 'uk_iot_actuators_tenant_actuator_code'
);
PREPARE stmt FROM @create_new_iot_actuators_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @drop_old_iot_media_nodes_unique_idx := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE iot_media_nodes DROP INDEX uk_iot_media_nodes_node_code',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'iot_media_nodes'
    AND index_name = 'uk_iot_media_nodes_node_code'
);
PREPARE stmt FROM @drop_old_iot_media_nodes_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @create_new_iot_media_nodes_unique_idx := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE iot_media_nodes ADD UNIQUE KEY uk_iot_media_nodes_tenant_node_code (tenant_id, node_code)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'iot_media_nodes'
    AND index_name = 'uk_iot_media_nodes_tenant_node_code'
);
PREPARE stmt FROM @create_new_iot_media_nodes_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @drop_old_iot_cameras_unique_idx := (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE iot_cameras DROP INDEX uk_iot_cameras_camera_code',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'iot_cameras'
    AND index_name = 'uk_iot_cameras_camera_code'
);
PREPARE stmt FROM @drop_old_iot_cameras_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @create_new_iot_cameras_unique_idx := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE iot_cameras ADD UNIQUE KEY uk_iot_cameras_tenant_camera_code (tenant_id, camera_code)',
    'SELECT 1'
  )
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'iot_cameras'
    AND index_name = 'uk_iot_cameras_tenant_camera_code'
);
PREPARE stmt FROM @create_new_iot_cameras_unique_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
