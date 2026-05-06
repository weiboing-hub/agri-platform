USE `agri_iot_platform_dev`;

SET @default_tenant_id = (
  SELECT id
  FROM `sys_tenants`
  WHERE `tenant_code` = 'default'
  LIMIT 1
);

INSERT INTO `iot_metric_defs`
  (`metric_code`, `metric_name`, `category_code`, `unit_name`, `value_type`, `precision_scale`,
   `normal_min`, `normal_max`, `warn_min`, `warn_max`, `chart_color`, `sort_order`, `enabled`, `remark`)
VALUES
  ('temperature', '温度', 'environment', '℃', 'decimal', 1, 10, 35, 5, 40, '#D96C4A', 10, 1, '环境温度指标'),
  ('humidity', '湿度', 'soil', '%', 'decimal', 1, 30, 80, 20, 90, '#3D8BCE', 20, 1, '空气或土壤湿度指标'),
  ('ec', '电导率', 'soil', 'mS/cm', 'decimal', 2, 0.20, 3.50, 0.10, 4.00, '#8F6BC2', 30, 1, '土壤电导率指标'),
  ('ph', '酸碱度', 'soil', 'pH', 'decimal', 2, 5.50, 7.50, 5.00, 8.00, '#5A9E6F', 40, 1, '土壤酸碱度指标'),
  ('co2', '二氧化碳', 'environment', 'ppm', 'integer', 0, 300, 1500, 200, 2000, '#64748B', 50, 1, '空气二氧化碳指标'),
  ('lux', '光照强度', 'environment', 'lux', 'integer', 0, 1000, 60000, 500, 80000, '#E6A23C', 60, 1, '环境光照指标'),
  ('soil_n', '土壤氮', 'soil', 'mg/kg', 'decimal', 1, NULL, NULL, NULL, NULL, '#7C9D32', 70, 1, '土壤氮含量'),
  ('soil_p', '土壤磷', 'soil', 'mg/kg', 'decimal', 1, NULL, NULL, NULL, NULL, '#3BA272', 80, 1, '土壤磷含量'),
  ('soil_k', '土壤钾', 'soil', 'mg/kg', 'decimal', 1, NULL, NULL, NULL, NULL, '#FC8452', 90, 1, '土壤钾含量')
ON DUPLICATE KEY UPDATE
  `metric_name` = VALUES(`metric_name`),
  `category_code` = VALUES(`category_code`),
  `unit_name` = VALUES(`unit_name`),
  `value_type` = VALUES(`value_type`),
  `precision_scale` = VALUES(`precision_scale`),
  `normal_min` = VALUES(`normal_min`),
  `normal_max` = VALUES(`normal_max`),
  `warn_min` = VALUES(`warn_min`),
  `warn_max` = VALUES(`warn_max`),
  `chart_color` = VALUES(`chart_color`),
  `sort_order` = VALUES(`sort_order`),
  `enabled` = VALUES(`enabled`),
  `remark` = VALUES(`remark`);

INSERT INTO `agri_crop_species`
  (`tenant_id`, `species_code`, `species_name`, `category_name`, `scientific_name`, `sort_order`, `status`, `remark`)
VALUES
  (@default_tenant_id, 'tomato', '番茄', '茄果类', 'Solanum lycopersicum', 10, 'enabled', '默认内置作物知识样例')
ON DUPLICATE KEY UPDATE
  `species_name` = VALUES(`species_name`),
  `category_name` = VALUES(`category_name`),
  `scientific_name` = VALUES(`scientific_name`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`),
  `remark` = VALUES(`remark`);

SET @crop_species_tomato_id = (
  SELECT id
  FROM `agri_crop_species`
  WHERE `tenant_id` = @default_tenant_id
    AND `species_code` = 'tomato'
  LIMIT 1
);

INSERT INTO `agri_crop_varieties`
  (`tenant_id`, `species_id`, `variety_code`, `variety_name`, `sort_order`, `status`, `remark`)
VALUES
  (@default_tenant_id, @crop_species_tomato_id, 'cherry_tomato', '樱桃番茄', 10, 'enabled', '默认内置品种样例')
ON DUPLICATE KEY UPDATE
  `variety_name` = VALUES(`variety_name`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`),
  `remark` = VALUES(`remark`);

SET @crop_variety_cherry_tomato_id = (
  SELECT id
  FROM `agri_crop_varieties`
  WHERE `tenant_id` = @default_tenant_id
    AND `variety_code` = 'cherry_tomato'
  LIMIT 1
);

INSERT INTO `agri_crop_growth_stages`
  (`tenant_id`, `species_id`, `stage_code`, `stage_name`, `stage_order`, `status`, `remark`)
VALUES
  (@default_tenant_id, @crop_species_tomato_id, 'flowering_fruiting', '开花坐果期', 30, 'enabled', '默认内置阶段样例')
ON DUPLICATE KEY UPDATE
  `stage_name` = VALUES(`stage_name`),
  `stage_order` = VALUES(`stage_order`),
  `status` = VALUES(`status`),
  `remark` = VALUES(`remark`);

SET @crop_stage_tomato_flowering_id = (
  SELECT id
  FROM `agri_crop_growth_stages`
  WHERE `tenant_id` = @default_tenant_id
    AND `species_id` = @crop_species_tomato_id
    AND `stage_code` = 'flowering_fruiting'
  LIMIT 1
);

DELETE FROM `agri_crop_target_profiles`
WHERE `tenant_id` = @default_tenant_id
  AND `species_id` = @crop_species_tomato_id
  AND `stage_id` = @crop_stage_tomato_flowering_id
  AND (`variety_id` = @crop_variety_cherry_tomato_id OR `variety_id` IS NULL);

INSERT INTO `agri_crop_target_profiles`
  (`tenant_id`, `species_id`, `variety_id`, `stage_id`, `metric_code`, `target_min`, `target_max`, `optimal_value`,
   `tolerance_text`, `advisory_text`, `source_name`, `sort_order`, `status`, `remark`)
VALUES
  (@default_tenant_id, @crop_species_tomato_id, @crop_variety_cherry_tomato_id, @crop_stage_tomato_flowering_id, 'temperature', 18.00, 28.00, 24.00,
   '白天建议 22-28℃，夜间不低于 15℃', '开花坐果期温度偏低会影响坐果，偏高会影响花粉活性。', '平台内置示例知识库', 10, 'enabled', '默认样例'),
  (@default_tenant_id, @crop_species_tomato_id, @crop_variety_cherry_tomato_id, @crop_stage_tomato_flowering_id, 'humidity', 55.00, 75.00, 65.00,
   '保持棚内相对湿度 55%-75%', '湿度过高易诱发病害，过低会影响授粉与蒸腾平衡。', '平台内置示例知识库', 20, 'enabled', '默认样例'),
  (@default_tenant_id, @crop_species_tomato_id, @crop_variety_cherry_tomato_id, @crop_stage_tomato_flowering_id, 'ec', 1.80, 3.20, 2.60,
   '依据水肥管理策略动态微调', '电导率偏低通常意味着营养不足，偏高要注意盐分胁迫。', '平台内置示例知识库', 30, 'enabled', '默认样例'),
  (@default_tenant_id, @crop_species_tomato_id, @crop_variety_cherry_tomato_id, @crop_stage_tomato_flowering_id, 'ph', 5.80, 6.80, 6.30,
   '建议维持在弱酸至中性', 'pH 偏离会影响养分吸收，尤其是磷钾与微量元素利用率。', '平台内置示例知识库', 40, 'enabled', '默认样例'),
  (@default_tenant_id, @crop_species_tomato_id, @crop_variety_cherry_tomato_id, @crop_stage_tomato_flowering_id, 'co2', 400.00, 1000.00, 800.00,
   '日间光照充足时适当补充', 'CO2 浓度合适有利于提高光合效率和坐果品质。', '平台内置示例知识库', 50, 'enabled', '默认样例'),
  (@default_tenant_id, @crop_species_tomato_id, @crop_variety_cherry_tomato_id, @crop_stage_tomato_flowering_id, 'lux', 10000.00, 45000.00, 25000.00,
   '根据季节和天气动态调整遮阳/补光', '光照不足易造成徒长，过强时需配合通风降温。', '平台内置示例知识库', 60, 'enabled', '默认样例'),
  (@default_tenant_id, @crop_species_tomato_id, @crop_variety_cherry_tomato_id, @crop_stage_tomato_flowering_id, 'soil_n', 80.00, 140.00, 110.00,
   '建议结合叶色和生长势综合判断', '氮过低生长势弱，过高则易徒长并延迟转色。', '平台内置示例知识库', 70, 'enabled', '默认样例'),
  (@default_tenant_id, @crop_species_tomato_id, @crop_variety_cherry_tomato_id, @crop_stage_tomato_flowering_id, 'soil_p', 30.00, 60.00, 45.00,
   '磷供应需关注花芽分化和根系活力', '磷偏低易影响开花和坐果，偏高则可能造成拮抗。', '平台内置示例知识库', 80, 'enabled', '默认样例'),
  (@default_tenant_id, @crop_species_tomato_id, @crop_variety_cherry_tomato_id, @crop_stage_tomato_flowering_id, 'soil_k', 180.00, 260.00, 220.00,
   '果实膨大期可适度提高钾水平', '钾充足有利于果实品质与抗逆性。', '平台内置示例知识库', 90, 'enabled', '默认样例');

INSERT INTO `biz_areas`
  (`tenant_id`, `area_code`, `area_name`, `area_type`, `area_level`, `area_size`, `crop_type`, `growth_stage`,
   `crop_species_id`, `crop_variety_id`, `crop_stage_id`,
   `weather_location_name`, `weather_provider_ref`, `latitude`, `longitude`, `status`, `remark`)
VALUES
  (@default_tenant_id, 'GH-EAST-001', '东棚 1 号', 'greenhouse', 1, 120.50, '番茄', '开花坐果期',
   @crop_species_tomato_id, @crop_variety_cherry_tomato_id, @crop_stage_tomato_flowering_id,
   '示范园区东棚', NULL, NULL, NULL, 'enabled', '演示区域')
ON DUPLICATE KEY UPDATE
  `tenant_id` = VALUES(`tenant_id`),
  `area_name` = VALUES(`area_name`),
  `area_type` = VALUES(`area_type`),
  `area_level` = VALUES(`area_level`),
  `area_size` = VALUES(`area_size`),
  `crop_type` = VALUES(`crop_type`),
  `growth_stage` = VALUES(`growth_stage`),
  `crop_species_id` = VALUES(`crop_species_id`),
  `crop_variety_id` = VALUES(`crop_variety_id`),
  `crop_stage_id` = VALUES(`crop_stage_id`),
  `weather_location_name` = VALUES(`weather_location_name`),
  `weather_provider_ref` = VALUES(`weather_provider_ref`),
  `latitude` = VALUES(`latitude`),
  `longitude` = VALUES(`longitude`),
  `status` = VALUES(`status`),
  `remark` = VALUES(`remark`);

INSERT INTO `iot_gateway_templates`
  (`tenant_id`, `template_code`, `template_name`, `gateway_type`, `config_json`, `status`, `remark`)
SELECT
  @default_tenant_id,
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
  '演示用 ESP32 模板'
FROM DUAL
ON DUPLICATE KEY UPDATE
  `template_name` = VALUES(`template_name`),
  `gateway_type` = VALUES(`gateway_type`),
  `config_json` = VALUES(`config_json`),
  `status` = VALUES(`status`),
  `remark` = VALUES(`remark`);

INSERT INTO `iot_gateways`
  (`tenant_id`, `gateway_code`, `gateway_name`, `gateway_type`, `serial_no`, `area_id`, `ip_address`, `mac_address`, `firmware_version`,
   `device_template_id`, `device_config_json`, `device_config_version`, `device_config_sync_status`, `device_config_message`,
   `online_status`, `last_heartbeat_at`, `wifi_rssi`, `runtime_mode`, `cached_record_count`, `cache_capacity`,
   `last_backfill_at`, `backfill_status`, `control_availability`, `status`, `remark`)
SELECT
  a.tenant_id, 'GW-EAST-001', '东棚网关 1 号', 'esp32', 'ESP32-DEMO-001', a.id, '192.168.1.88', 'AA:BB:CC:DD:EE:01', 'v0.1.0',
  t.id,
  t.config_json,
  1,
  'pending_push',
  '演示网关已绑定默认 ESP32 模板',
  'online', NOW(), -56, 'auto', 8, 500, DATE_SUB(NOW(), INTERVAL 2 HOUR), 'idle', 'enabled', 'enabled', '演示网关'
FROM `biz_areas` a
JOIN `iot_gateway_templates` t ON t.tenant_id = a.tenant_id AND t.template_code = 'TPL-ESP32-SOIL-GW'
WHERE a.area_code = 'GH-EAST-001'
  AND a.tenant_id = @default_tenant_id
ON DUPLICATE KEY UPDATE
  `tenant_id` = VALUES(`tenant_id`),
  `gateway_name` = VALUES(`gateway_name`),
  `gateway_type` = VALUES(`gateway_type`),
  `area_id` = VALUES(`area_id`),
  `ip_address` = VALUES(`ip_address`),
  `mac_address` = VALUES(`mac_address`),
  `firmware_version` = VALUES(`firmware_version`),
  `device_template_id` = VALUES(`device_template_id`),
  `device_config_json` = VALUES(`device_config_json`),
  `device_config_version` = VALUES(`device_config_version`),
  `device_config_sync_status` = VALUES(`device_config_sync_status`),
  `device_config_message` = VALUES(`device_config_message`),
  `online_status` = VALUES(`online_status`),
  `last_heartbeat_at` = VALUES(`last_heartbeat_at`),
  `wifi_rssi` = VALUES(`wifi_rssi`),
  `runtime_mode` = VALUES(`runtime_mode`),
  `cached_record_count` = VALUES(`cached_record_count`),
  `cache_capacity` = VALUES(`cache_capacity`),
  `last_backfill_at` = VALUES(`last_backfill_at`),
  `backfill_status` = VALUES(`backfill_status`),
  `control_availability` = VALUES(`control_availability`),
  `status` = VALUES(`status`),
  `remark` = VALUES(`remark`);

INSERT INTO `iot_sensors`
  (`tenant_id`, `sensor_code`, `sensor_name`, `sensor_type`, `model_name`, `protocol_type`, `modbus_address`, `gateway_id`, `area_id`,
   `install_position`, `unit_name`, `current_value_decimal`, `sensor_status`, `calibration_status`, `data_quality_score`,
   `last_collected_at`, `last_received_at`, `remark`)
SELECT
  g.tenant_id, 'S-TEMP-001', '空气温度传感器', 'temperature', 'RS485-TEMP', 'modbus', 1, g.id, g.area_id,
  '东棚中部', '℃', 24.6, 'enabled', 'calibrated', 96.50, NOW(), NOW(), '演示温度传感器'
FROM `iot_gateways` g
WHERE g.gateway_code = 'GW-EAST-001'
  AND g.tenant_id = @default_tenant_id
ON DUPLICATE KEY UPDATE
  `tenant_id` = VALUES(`tenant_id`),
  `sensor_name` = VALUES(`sensor_name`),
  `gateway_id` = VALUES(`gateway_id`),
  `area_id` = VALUES(`area_id`),
  `unit_name` = VALUES(`unit_name`),
  `current_value_decimal` = VALUES(`current_value_decimal`),
  `sensor_status` = VALUES(`sensor_status`),
  `calibration_status` = VALUES(`calibration_status`),
  `data_quality_score` = VALUES(`data_quality_score`),
  `last_collected_at` = VALUES(`last_collected_at`),
  `last_received_at` = VALUES(`last_received_at`),
  `remark` = VALUES(`remark`);

INSERT INTO `iot_sensor_channels`
  (`sensor_id`, `channel_code`, `channel_name`, `metric_code`, `register_address`, `register_length`,
   `scale_factor`, `offset_value`, `unit_name`, `channel_order`, `enabled`, `remark`)
SELECT
  s.id,
  'TEMP-1',
  '温度通道',
  'temperature',
  0,
  1,
  1.000000,
  0.000000,
  '℃',
  1,
  1,
  '演示温度通道'
FROM `iot_sensors` s
WHERE s.sensor_code = 'S-TEMP-001'
  AND s.tenant_id = @default_tenant_id
ON DUPLICATE KEY UPDATE
  `channel_name` = VALUES(`channel_name`),
  `metric_code` = VALUES(`metric_code`),
  `unit_name` = VALUES(`unit_name`),
  `enabled` = VALUES(`enabled`),
  `remark` = VALUES(`remark`);

INSERT INTO `iot_sensor_channels`
  (`sensor_id`, `channel_code`, `channel_name`, `metric_code`, `register_address`, `register_length`,
   `scale_factor`, `offset_value`, `unit_name`, `channel_order`, `enabled`, `remark`)
SELECT
  s.id,
  'HUM-1',
  '湿度通道',
  'humidity',
  1,
  1,
  1.000000,
  0.000000,
  '%',
  1,
  1,
  '演示湿度通道'
FROM `iot_sensors` s
WHERE s.sensor_code = 'S-HUM-001'
  AND s.tenant_id = @default_tenant_id
ON DUPLICATE KEY UPDATE
  `channel_name` = VALUES(`channel_name`),
  `metric_code` = VALUES(`metric_code`),
  `unit_name` = VALUES(`unit_name`),
  `enabled` = VALUES(`enabled`),
  `remark` = VALUES(`remark`);

INSERT INTO `iot_sensors`
  (`tenant_id`, `sensor_code`, `sensor_name`, `sensor_type`, `model_name`, `protocol_type`, `modbus_address`, `gateway_id`, `area_id`,
   `install_position`, `unit_name`, `current_value_decimal`, `sensor_status`, `calibration_status`, `data_quality_score`,
   `last_collected_at`, `last_received_at`, `remark`)
SELECT
  g.tenant_id, 'S-HUM-001', '土壤湿度传感器', 'humidity', 'RS485-HUM', 'modbus', 2, g.id, g.area_id,
  '东棚根区', '%', 48.2, 'enabled', 'calibrated', 93.20, NOW(), NOW(), '演示湿度传感器'
FROM `iot_gateways` g
WHERE g.gateway_code = 'GW-EAST-001'
  AND g.tenant_id = @default_tenant_id
ON DUPLICATE KEY UPDATE
  `tenant_id` = VALUES(`tenant_id`),
  `sensor_name` = VALUES(`sensor_name`),
  `gateway_id` = VALUES(`gateway_id`),
  `area_id` = VALUES(`area_id`),
  `unit_name` = VALUES(`unit_name`),
  `current_value_decimal` = VALUES(`current_value_decimal`),
  `sensor_status` = VALUES(`sensor_status`),
  `calibration_status` = VALUES(`calibration_status`),
  `data_quality_score` = VALUES(`data_quality_score`),
  `last_collected_at` = VALUES(`last_collected_at`),
  `last_received_at` = VALUES(`last_received_at`),
  `remark` = VALUES(`remark`);

INSERT INTO `iot_actuators`
  (`tenant_id`, `actuator_code`, `actuator_name`, `actuator_type`, `gateway_id`, `area_id`, `control_channel`,
   `desired_state_text`, `reported_state_text`, `shadow_status`, `last_action_at`, `max_run_seconds`,
   `mutex_group`, `running_mode`, `status`, `remark`)
SELECT
  g.tenant_id, 'A-PUMP-001', '灌溉水泵 1 号', 'water_pump', g.id, g.area_id, 'relay-1',
  'off', 'off', 'sync', DATE_SUB(NOW(), INTERVAL 20 MINUTE), 1800, 'pump_group_1', 'auto', 'enabled', '演示执行器'
FROM `iot_gateways` g
WHERE g.gateway_code = 'GW-EAST-001'
  AND g.tenant_id = @default_tenant_id
ON DUPLICATE KEY UPDATE
  `tenant_id` = VALUES(`tenant_id`),
  `actuator_name` = VALUES(`actuator_name`),
  `gateway_id` = VALUES(`gateway_id`),
  `area_id` = VALUES(`area_id`),
  `control_channel` = VALUES(`control_channel`),
  `desired_state_text` = VALUES(`desired_state_text`),
  `reported_state_text` = VALUES(`reported_state_text`),
  `shadow_status` = VALUES(`shadow_status`),
  `last_action_at` = VALUES(`last_action_at`),
  `max_run_seconds` = VALUES(`max_run_seconds`),
  `mutex_group` = VALUES(`mutex_group`),
  `running_mode` = VALUES(`running_mode`),
  `status` = VALUES(`status`),
  `remark` = VALUES(`remark`);

INSERT INTO `iot_device_shadow`
  (`actuator_id`, `desired_state_json`, `reported_state_json`, `shadow_status`, `desired_updated_at`, `reported_updated_at`, `last_command_result`, `drift_seconds`)
SELECT
  a.id,
  JSON_OBJECT('power', 'off'),
  JSON_OBJECT('power', 'off'),
  'sync',
  DATE_SUB(NOW(), INTERVAL 20 MINUTE),
  DATE_SUB(NOW(), INTERVAL 20 MINUTE),
  '执行成功',
  0
FROM `iot_actuators` a
WHERE a.actuator_code = 'A-PUMP-001'
  AND a.tenant_id = @default_tenant_id
ON DUPLICATE KEY UPDATE
  `desired_state_json` = VALUES(`desired_state_json`),
  `reported_state_json` = VALUES(`reported_state_json`),
  `shadow_status` = VALUES(`shadow_status`),
  `desired_updated_at` = VALUES(`desired_updated_at`),
  `reported_updated_at` = VALUES(`reported_updated_at`),
  `last_command_result` = VALUES(`last_command_result`),
  `drift_seconds` = VALUES(`drift_seconds`);

INSERT INTO `iot_gateway_backfill_batches`
  (`batch_no`, `gateway_id`, `cached_record_count_before`, `uploaded_record_count`, `failed_record_count`,
   `oldest_pending_collected_at`, `started_at`, `finished_at`, `status`, `failure_reason`)
SELECT
  'BF-DEMO-001', g.id, 12, 12, 0, DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 110 MINUTE), 'success', NULL
FROM `iot_gateways` g
WHERE g.gateway_code = 'GW-EAST-001'
  AND g.tenant_id = @default_tenant_id
  AND NOT EXISTS (SELECT 1 FROM `iot_gateway_backfill_batches` b WHERE b.batch_no = 'BF-DEMO-001');

INSERT INTO `iot_sensor_readings`
  (`gateway_id`, `sensor_id`, `area_id`, `metric_code`, `metric_name`, `metric_value`, `unit_name`, `data_source`,
   `is_backfilled`, `collected_at`, `received_at`, `clock_synced`, `time_uncertainty_ms`, `time_quality`, `delay_ms`, `quality_score`, `raw_payload_json`)
SELECT g.id, s.id, s.area_id, 'temperature', '空气温度', 23.4, '℃', 'realtime', 0,
       DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR), 1, 10, 'high', 350, 98.00,
       JSON_OBJECT('metric', 'temperature', 'value', 23.4)
FROM `iot_gateways` g
JOIN `iot_sensors` s ON s.gateway_id = g.id
WHERE g.gateway_code = 'GW-EAST-001'
  AND g.tenant_id = @default_tenant_id
  AND s.sensor_code = 'S-TEMP-001'
  AND s.tenant_id = g.tenant_id
  AND NOT EXISTS (
    SELECT 1 FROM `iot_sensor_readings` r
    WHERE r.sensor_id = s.id AND r.metric_code = 'temperature' AND r.collected_at = DATE_SUB(NOW(), INTERVAL 4 HOUR)
  );

INSERT INTO `iot_sensor_readings`
  (`gateway_id`, `sensor_id`, `area_id`, `metric_code`, `metric_name`, `metric_value`, `unit_name`, `data_source`,
   `is_backfilled`, `collected_at`, `received_at`, `clock_synced`, `time_uncertainty_ms`, `time_quality`, `delay_ms`, `quality_score`, `raw_payload_json`)
SELECT g.id, s.id, s.area_id, 'temperature', '空气温度', 24.1, '℃', 'realtime', 0,
       DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), 1, 10, 'high', 300, 97.00,
       JSON_OBJECT('metric', 'temperature', 'value', 24.1)
FROM `iot_gateways` g
JOIN `iot_sensors` s ON s.gateway_id = g.id
WHERE g.gateway_code = 'GW-EAST-001'
  AND g.tenant_id = @default_tenant_id
  AND s.sensor_code = 'S-TEMP-001'
  AND s.tenant_id = g.tenant_id
  AND NOT EXISTS (
    SELECT 1 FROM `iot_sensor_readings` r
    WHERE r.sensor_id = s.id AND r.metric_code = 'temperature' AND r.collected_at = DATE_SUB(NOW(), INTERVAL 2 HOUR)
  );

INSERT INTO `iot_sensor_readings`
  (`gateway_id`, `sensor_id`, `area_id`, `metric_code`, `metric_name`, `metric_value`, `unit_name`, `data_source`,
   `is_backfilled`, `collected_at`, `received_at`, `clock_synced`, `time_uncertainty_ms`, `time_quality`, `delay_ms`, `quality_score`, `raw_payload_json`)
SELECT g.id, s.id, s.area_id, 'humidity', '土壤湿度', 46.8, '%', 'backfill', 1,
       DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), 0, 8000, 'medium', 3600000, 88.00,
       JSON_OBJECT('metric', 'humidity', 'value', 46.8)
FROM `iot_gateways` g
JOIN `iot_sensors` s ON s.gateway_id = g.id
WHERE g.gateway_code = 'GW-EAST-001'
  AND g.tenant_id = @default_tenant_id
  AND s.sensor_code = 'S-HUM-001'
  AND s.tenant_id = g.tenant_id
  AND NOT EXISTS (
    SELECT 1 FROM `iot_sensor_readings` r
    WHERE r.sensor_id = s.id AND r.metric_code = 'humidity' AND r.collected_at = DATE_SUB(NOW(), INTERVAL 3 HOUR)
  );

INSERT INTO `iot_sensor_readings`
  (`gateway_id`, `sensor_id`, `area_id`, `metric_code`, `metric_name`, `metric_value`, `unit_name`, `data_source`,
   `is_backfilled`, `collected_at`, `received_at`, `clock_synced`, `time_uncertainty_ms`, `time_quality`, `delay_ms`, `quality_score`, `raw_payload_json`)
SELECT g.id, s.id, s.area_id, 'humidity', '土壤湿度', 48.2, '%', 'realtime', 0,
       DATE_SUB(NOW(), INTERVAL 30 MINUTE), DATE_SUB(NOW(), INTERVAL 29 MINUTE), 1, 10, 'high', 280, 95.00,
       JSON_OBJECT('metric', 'humidity', 'value', 48.2)
FROM `iot_gateways` g
JOIN `iot_sensors` s ON s.gateway_id = g.id
WHERE g.gateway_code = 'GW-EAST-001'
  AND g.tenant_id = @default_tenant_id
  AND s.sensor_code = 'S-HUM-001'
  AND s.tenant_id = g.tenant_id
  AND NOT EXISTS (
    SELECT 1 FROM `iot_sensor_readings` r
    WHERE r.sensor_id = s.id AND r.metric_code = 'humidity' AND r.collected_at = DATE_SUB(NOW(), INTERVAL 30 MINUTE)
  );

INSERT INTO `rule_definitions`
  (`tenant_id`, `rule_code`, `rule_name`, `rule_type`, `target_type`, `target_ids_json`, `builder_mode`, `condition_json`, `action_json`,
   `recovery_policy`, `recovery_stable_seconds`, `cooldown_seconds`, `daily_max_executions`, `priority`, `enabled`, `created_by`, `updated_by`)
SELECT
  s.tenant_id,
  'RULE-HUM-ALERT-001',
  '土壤湿度低阈值告警',
  'threshold',
  'sensor',
  JSON_ARRAY(s.id),
  'visual',
  JSON_OBJECT('summary', 'humidity < 30 持续 300 秒', 'metric', 'humidity', 'operator', '<', 'threshold', 30, 'stableSeconds', 300, 'areaId', s.area_id),
  JSON_OBJECT('summary', 'create_alert + notify', 'actions', JSON_ARRAY(JSON_OBJECT('type', 'create_alert', 'severity', 'medium'), JSON_OBJECT('type', 'notify', 'channel', 'in_app'))),
  'manual_close',
  0,
  600,
  0,
  40,
  1,
  1,
  1
FROM `iot_sensors` s
WHERE s.sensor_code = 'S-HUM-001'
  AND s.tenant_id = @default_tenant_id
  AND NOT EXISTS (
    SELECT 1
    FROM `rule_definitions` r
    WHERE r.tenant_id = s.tenant_id
      AND r.rule_code = 'RULE-HUM-ALERT-001'
  );

INSERT INTO `rule_definitions`
  (`tenant_id`, `rule_code`, `rule_name`, `rule_type`, `target_type`, `target_ids_json`, `builder_mode`, `condition_json`, `action_json`,
   `recovery_policy`, `recovery_stable_seconds`, `cooldown_seconds`, `daily_max_executions`, `priority`, `enabled`, `created_by`, `updated_by`)
SELECT
  a.tenant_id,
  'RULE-HUM-IRRIGATE-001',
  '低湿自动灌溉策略',
  'threshold',
  'actuator',
  JSON_ARRAY(a.id),
  'visual',
  JSON_OBJECT('summary', 'humidity < 28 持续 300 秒', 'metric', 'humidity', 'operator', '<', 'threshold', 28, 'stableSeconds', 300, 'areaId', a.area_id, 'note', '自动灌溉联动'),
  JSON_OBJECT('summary', CONCAT('control:on actuator ', a.id, ' 120s'), 'actions', JSON_ARRAY(JSON_OBJECT('type', 'control', 'actuatorId', a.id, 'controlType', 'on', 'durationSeconds', 120))),
  'manual_close',
  0,
  1800,
  6,
  50,
  1,
  1,
  1
FROM `iot_actuators` a
WHERE a.actuator_code = 'A-PUMP-001'
  AND a.tenant_id = @default_tenant_id
  AND NOT EXISTS (
    SELECT 1
    FROM `rule_definitions` r
    WHERE r.tenant_id = a.tenant_id
      AND r.rule_code = 'RULE-HUM-IRRIGATE-001'
  );

INSERT INTO `ops_control_commands`
  (`command_no`, `area_id`, `gateway_id`, `actuator_id`, `source_type`, `mode_type`, `control_type`,
   `requested_state_json`, `duration_seconds`, `force_execute`, `reason_text`, `request_status`,
   `device_online`, `backfill_in_progress`, `queued_at`, `sent_at`)
SELECT
  'CMD-DEMO-001', a.area_id, a.gateway_id, a.id, 'auto', 'auto', 'on',
  JSON_OBJECT('power', 'on'), 120, 0, '土壤湿度偏低自动灌溉', 'executed', 1, 0,
  DATE_SUB(NOW(), INTERVAL 25 MINUTE), DATE_SUB(NOW(), INTERVAL 24 MINUTE)
FROM `iot_actuators` a
WHERE a.actuator_code = 'A-PUMP-001'
  AND a.tenant_id = @default_tenant_id
  AND NOT EXISTS (SELECT 1 FROM `ops_control_commands` c WHERE c.command_no = 'CMD-DEMO-001');

INSERT INTO `ops_control_executions`
  (`command_id`, `gateway_id`, `actuator_id`, `execution_status`, `desired_state_json`, `reported_state_json`,
   `shadow_status_after`, `result_code`, `result_message`, `ack_at`, `started_at`, `completed_at`)
SELECT
  c.id, c.gateway_id, c.actuator_id, 'success',
  JSON_OBJECT('power', 'on'),
  JSON_OBJECT('power', 'on'),
  'sync',
  'OK',
  '执行成功',
  DATE_SUB(NOW(), INTERVAL 24 MINUTE),
  DATE_SUB(NOW(), INTERVAL 24 MINUTE),
  DATE_SUB(NOW(), INTERVAL 22 MINUTE)
FROM `ops_control_commands` c
WHERE c.command_no = 'CMD-DEMO-001'
  AND NOT EXISTS (SELECT 1 FROM `ops_control_executions` e WHERE e.command_id = c.id);

INSERT INTO `ops_alerts`
  (`tenant_id`, `alert_no`, `rule_id`, `area_id`, `gateway_id`, `sensor_id`, `alert_type`, `severity`, `status`, `title`,
   `content_text`, `current_value_decimal`, `unit_name`, `trigger_source`, `reopen_count`, `triggered_at`, `last_transition_at`)
SELECT
  s.tenant_id, 'ALERT-DEMO-001', r.id, s.area_id, s.gateway_id, s.id, 'low_humidity', 'medium', 'pending', '土壤湿度偏低',
  '最近一段时间内土壤湿度低于阈值，建议检查灌溉策略。', 46.8, '%', 'rule', 0, DATE_SUB(NOW(), INTERVAL 40 MINUTE), DATE_SUB(NOW(), INTERVAL 40 MINUTE)
FROM `iot_sensors` s
JOIN `rule_definitions` r ON r.tenant_id = s.tenant_id AND r.rule_code = 'RULE-HUM-ALERT-001'
WHERE s.sensor_code = 'S-HUM-001'
  AND s.tenant_id = @default_tenant_id
  AND NOT EXISTS (SELECT 1 FROM `ops_alerts` a WHERE a.alert_no = 'ALERT-DEMO-001');

INSERT INTO `ops_notifications`
  (`tenant_id`, `notification_no`, `alert_id`, `channel_type`, `receiver_type`, `receiver_value`, `content_summary`, `send_status`,
   `retry_count`, `response_text`, `sent_at`)
SELECT
  a.tenant_id, 'NTF-DEMO-001', a.id, 'wechat', 'user', 'ops.lead', '土壤湿度偏低告警已推送到值班群', 'sent',
  0, '推送成功', DATE_SUB(NOW(), INTERVAL 35 MINUTE)
FROM `ops_alerts` a
WHERE a.alert_no = 'ALERT-DEMO-001'
  AND NOT EXISTS (SELECT 1 FROM `ops_notifications` n WHERE n.notification_no = 'NTF-DEMO-001');

INSERT INTO `ops_notifications`
  (`tenant_id`, `notification_no`, `alert_id`, `channel_type`, `receiver_type`, `receiver_value`, `content_summary`, `send_status`,
   `retry_count`, `response_text`, `sent_at`)
SELECT
  a.tenant_id, 'NTF-DEMO-002', a.id, 'sms', 'user', '13800000000', '土壤湿度偏低短信通知重试中', 'failed',
  1, '网关短信通道超时', NULL
FROM `ops_alerts` a
WHERE a.alert_no = 'ALERT-DEMO-001'
  AND NOT EXISTS (SELECT 1 FROM `ops_notifications` n WHERE n.notification_no = 'NTF-DEMO-002');

INSERT INTO `ai_tasks`
  (`tenant_id`, `task_no`, `task_type`, `trigger_type`, `scope_type`, `scope_ids_json`, `dedupe_key`, `related_alert_count`, `status`,
   `retry_count`, `max_retry_count`, `payload_json`, `scheduled_at`, `started_at`, `completed_at`)
SELECT
  a.tenant_id, 'AI-TASK-DEMO-001', 'diagnosis', 'event', 'area',
  JSON_ARRAY(a.id), 'area:GH-EAST-001:diagnosis', 1, 'success', 0, 3,
  JSON_OBJECT('reason', 'demo diagnosis'), DATE_SUB(NOW(), INTERVAL 38 MINUTE), DATE_SUB(NOW(), INTERVAL 37 MINUTE), DATE_SUB(NOW(), INTERVAL 36 MINUTE)
FROM `biz_areas` a
WHERE a.area_code = 'GH-EAST-001'
  AND a.tenant_id = @default_tenant_id
  AND NOT EXISTS (SELECT 1 FROM `ai_tasks` t WHERE t.task_no = 'AI-TASK-DEMO-001');

INSERT INTO `ai_reports`
  (`tenant_id`, `report_no`, `task_id`, `report_type`, `report_date`, `version_no`, `scope_type`, `scope_ids_json`, `status`,
   `metrics_json`, `summary_text`, `content_markdown`, `is_current_version`, `trigger_type`, `generated_at`)
SELECT
  a.tenant_id, 'AI-REPORT-DEMO-001', t.id, 'diagnosis', CURDATE(), 1, 'area',
  JSON_ARRAY(a.id), 'generated',
  JSON_OBJECT('avgHumidity', 47.5, 'avgTemperature', 24.0),
  '东棚 1 号整体运行稳定，土壤湿度略低但已执行自动灌溉，建议继续观察。',
  '## AI诊断\n\n- 区域：东棚 1 号\n- 结论：整体稳定，湿度略低\n- 建议：继续观察并关注后续回升情况',
  1, 'event', DATE_SUB(NOW(), INTERVAL 35 MINUTE)
FROM `ai_tasks` t
JOIN `biz_areas` a ON a.tenant_id = t.tenant_id AND a.area_code = 'GH-EAST-001'
WHERE t.task_no = 'AI-TASK-DEMO-001'
  AND NOT EXISTS (SELECT 1 FROM `ai_reports` r WHERE r.report_no = 'AI-REPORT-DEMO-001');

INSERT INTO `ai_tasks`
  (`tenant_id`, `task_no`, `task_type`, `trigger_type`, `scope_type`, `scope_ids_json`, `dedupe_key`, `related_alert_count`, `status`,
   `retry_count`, `max_retry_count`, `payload_json`, `scheduled_at`, `created_at`)
SELECT
  @default_tenant_id, 'AI-TASK-DEMO-002', 'report', 'schedule', 'global',
  JSON_ARRAY(), 'global:daily:scheduled', 0, 'queued', 0, 3,
  JSON_OBJECT('reportType', 'daily', 'reportDate', CURDATE(), 'reasonText', '定时生成日报'), DATE_ADD(NOW(), INTERVAL 15 MINUTE), NOW()
WHERE NOT EXISTS (SELECT 1 FROM `ai_tasks` t WHERE t.task_no = 'AI-TASK-DEMO-002');

INSERT INTO `ai_tasks`
  (`tenant_id`, `task_no`, `task_type`, `trigger_type`, `scope_type`, `scope_ids_json`, `dedupe_key`, `related_alert_count`, `status`,
   `retry_count`, `max_retry_count`, `payload_json`, `error_message`, `scheduled_at`, `created_at`)
SELECT
  a.tenant_id, 'AI-TASK-DEMO-003', 'report', 'manual', 'area',
  JSON_ARRAY(a.id), 'area:GH-EAST-001:weekly', 1, 'failed', 1, 3,
  JSON_OBJECT('reportType', 'weekly', 'reportDate', CURDATE(), 'reasonText', '周报补生成'),
  '上游模型服务超时',
  DATE_SUB(NOW(), INTERVAL 90 MINUTE), DATE_SUB(NOW(), INTERVAL 90 MINUTE)
FROM `biz_areas` a
WHERE a.area_code = 'GH-EAST-001'
  AND a.tenant_id = @default_tenant_id
  AND NOT EXISTS (SELECT 1 FROM `ai_tasks` t WHERE t.task_no = 'AI-TASK-DEMO-003');

INSERT INTO `ai_reports`
  (`tenant_id`, `report_no`, `task_id`, `report_type`, `report_date`, `version_no`, `scope_type`, `scope_ids_json`, `status`,
   `metrics_json`, `summary_text`, `content_markdown`, `is_current_version`, `trigger_type`, `generated_at`)
SELECT
  @default_tenant_id, 'AI-REPORT-DEMO-002', t.id, 'daily', CURDATE(), 1, 'global',
  JSON_ARRAY(), 'generated',
  JSON_OBJECT('avgHumidity', 47.9, 'avgTemperature', 24.2, 'riskLevel', 'low', 'scopeNames', JSON_ARRAY('全局视图'), 'relatedAlertCount', 1),
  '今日日报显示整体环境稳定，网关在线率正常，建议继续观察湿度变化。',
  '# AI日报\n\n- 结论：整体稳定\n- 风险等级：low\n- 建议：保持现有策略并持续关注低湿区域',
  1, 'schedule', DATE_SUB(NOW(), INTERVAL 20 MINUTE)
FROM `ai_tasks` t
WHERE t.task_no = 'AI-TASK-DEMO-002'
  AND NOT EXISTS (SELECT 1 FROM `ai_reports` r WHERE r.report_no = 'AI-REPORT-DEMO-002');

INSERT INTO `iot_media_nodes`
  (`tenant_id`, `node_code`, `node_name`, `node_type`, `host_address`, `api_base_url`, `rtmp_base_url`, `hls_base_url`,
   `ftp_root_path`, `status`, `health_status`, `last_heartbeat_at`, `remark`)
VALUES
  (@default_tenant_id, 'MEDIA-EAST-001', '东棚媒体节点', 'media_server', '192.168.1.150', 'http://192.168.1.150:8080/api',
   'rtmp://192.168.1.150/live', 'http://192.168.1.150:8080/hls', '/data/camera-ftp', 'enabled', 'healthy', NOW(), '演示媒体节点')
ON DUPLICATE KEY UPDATE
  `tenant_id` = VALUES(`tenant_id`),
  `node_name` = VALUES(`node_name`),
  `node_type` = VALUES(`node_type`),
  `host_address` = VALUES(`host_address`),
  `api_base_url` = VALUES(`api_base_url`),
  `rtmp_base_url` = VALUES(`rtmp_base_url`),
  `hls_base_url` = VALUES(`hls_base_url`),
  `ftp_root_path` = VALUES(`ftp_root_path`),
  `status` = VALUES(`status`),
  `health_status` = VALUES(`health_status`),
  `last_heartbeat_at` = VALUES(`last_heartbeat_at`),
  `remark` = VALUES(`remark`);

INSERT INTO `iot_cameras`
  (`tenant_id`, `camera_code`, `camera_name`, `camera_type`, `vendor_name`, `model_name`, `serial_no`, `gateway_id`, `area_id`,
   `media_node_id`, `ip_address`, `mac_address`, `wifi_ssid`, `install_position`, `orientation_text`, `capture_mode`,
   `stream_protocol`, `online_status`, `last_online_at`, `snapshot_enabled`, `record_enabled`, `status`, `remark`)
SELECT
  a.tenant_id, 'CAM-EAST-001', '东棚顶部摄像头', 'wifi_camera', 'Hikvision', 'DS-2CD-DEMO', 'CAM-DEMO-001', g.id, a.id, m.id,
  '192.168.1.160', '00:11:22:33:44:55', 'xiangyu901', '东棚顶部中央', '朝南', 'schedule', 'rtsp', 'online',
  NOW(), 1, 0, 'enabled', '演示摄像头'
FROM `biz_areas` a
JOIN `iot_gateways` g ON g.area_id = a.id AND g.gateway_code = 'GW-EAST-001' AND g.tenant_id = a.tenant_id
JOIN `iot_media_nodes` m ON m.node_code = 'MEDIA-EAST-001' AND m.tenant_id = a.tenant_id
WHERE a.area_code = 'GH-EAST-001'
  AND a.tenant_id = @default_tenant_id
ON DUPLICATE KEY UPDATE
  `tenant_id` = VALUES(`tenant_id`),
  `camera_name` = VALUES(`camera_name`),
  `camera_type` = VALUES(`camera_type`),
  `vendor_name` = VALUES(`vendor_name`),
  `model_name` = VALUES(`model_name`),
  `gateway_id` = VALUES(`gateway_id`),
  `area_id` = VALUES(`area_id`),
  `media_node_id` = VALUES(`media_node_id`),
  `ip_address` = VALUES(`ip_address`),
  `wifi_ssid` = VALUES(`wifi_ssid`),
  `install_position` = VALUES(`install_position`),
  `orientation_text` = VALUES(`orientation_text`),
  `capture_mode` = VALUES(`capture_mode`),
  `stream_protocol` = VALUES(`stream_protocol`),
  `online_status` = VALUES(`online_status`),
  `last_online_at` = VALUES(`last_online_at`),
  `snapshot_enabled` = VALUES(`snapshot_enabled`),
  `record_enabled` = VALUES(`record_enabled`),
  `status` = VALUES(`status`),
  `remark` = VALUES(`remark`);

INSERT INTO `iot_camera_streams`
  (`camera_id`, `stream_name`, `stream_role`, `source_protocol`, `source_url`, `stream_username`, `stream_password`,
   `target_protocol`, `target_url`, `resolution_text`, `frame_rate`, `bitrate_kbps`, `is_default_stream`, `status`)
SELECT
  c.id, '主码流', 'main', 'rtsp', 'rtsp://admin:admin123@192.168.1.160:554/Streaming/Channels/101', 'admin', 'admin123',
  'hls', 'http://192.168.1.150:8080/hls/cam-east-001.m3u8', '1920x1080', 25, 2048, 1, 'enabled'
FROM `iot_cameras` c
WHERE c.camera_code = 'CAM-EAST-001'
  AND c.tenant_id = @default_tenant_id
ON DUPLICATE KEY UPDATE
  `source_protocol` = VALUES(`source_protocol`),
  `source_url` = VALUES(`source_url`),
  `stream_username` = VALUES(`stream_username`),
  `stream_password` = VALUES(`stream_password`),
  `target_protocol` = VALUES(`target_protocol`),
  `target_url` = VALUES(`target_url`),
  `resolution_text` = VALUES(`resolution_text`),
  `frame_rate` = VALUES(`frame_rate`),
  `bitrate_kbps` = VALUES(`bitrate_kbps`),
  `status` = VALUES(`status`);

INSERT INTO `iot_camera_capture_jobs`
  (`job_no`, `tenant_id`, `camera_id`, `trigger_type`, `trigger_source_type`, `capture_purpose`, `status`,
   `scheduled_at`, `started_at`, `finished_at`, `request_params_json`, `created_by`)
SELECT
  'CAP-DEMO-001', c.tenant_id, c.id, 'manual', 'user', 'preview', 'success',
  DATE_SUB(NOW(), INTERVAL 30 MINUTE), DATE_SUB(NOW(), INTERVAL 30 MINUTE), DATE_SUB(NOW(), INTERVAL 29 MINUTE),
  JSON_OBJECT('capturePurpose', 'preview', 'remark', '演示手动抓图'), 1
FROM `iot_cameras` c
WHERE c.camera_code = 'CAM-EAST-001'
  AND c.tenant_id = @default_tenant_id
  AND NOT EXISTS (SELECT 1 FROM `iot_camera_capture_jobs` j WHERE j.job_no = 'CAP-DEMO-001');

INSERT INTO `iot_camera_snapshots`
  (`snapshot_no`, `tenant_id`, `camera_id`, `capture_job_id`, `area_id`, `gateway_id`, `source_type`, `captured_at`, `received_at`,
   `storage_provider`, `file_path`, `thumbnail_path`, `mime_type`, `image_width`, `image_height`, `remark`)
SELECT
  'SNP-DEMO-001', c.tenant_id, c.id, j.id, c.area_id, c.gateway_id, 'manual',
  DATE_SUB(NOW(), INTERVAL 29 MINUTE), DATE_SUB(NOW(), INTERVAL 29 MINUTE),
  'local', 'tenant/default/camera/cam-east-001/snapshot/manual/2026/03/29/snp-demo-001.jpg', 'tenant/default/camera/cam-east-001/snapshot/manual/2026/03/29/thumb/snp-demo-001-thumb.jpg',
  'image/jpeg', 1920, 1080, '演示手动抓图结果'
FROM `iot_cameras` c
JOIN `iot_camera_capture_jobs` j ON j.job_no = 'CAP-DEMO-001'
WHERE c.camera_code = 'CAM-EAST-001'
  AND c.tenant_id = @default_tenant_id
  AND NOT EXISTS (SELECT 1 FROM `iot_camera_snapshots` s WHERE s.snapshot_no = 'SNP-DEMO-001');

INSERT INTO `iot_camera_snapshots`
  (`snapshot_no`, `tenant_id`, `camera_id`, `area_id`, `gateway_id`, `source_type`, `captured_at`, `received_at`,
   `storage_provider`, `file_path`, `ftp_path`, `thumbnail_path`, `mime_type`, `image_width`, `image_height`, `remark`)
SELECT
  'FTP-DEMO-001', c.tenant_id, c.id, c.area_id, c.gateway_id, 'ftp_upload',
  DATE_SUB(NOW(), INTERVAL 12 MINUTE), DATE_SUB(NOW(), INTERVAL 11 MINUTE),
  'local', 'tenant/default/camera/cam-east-001/snapshot/ftp-upload/2026/03/29/ftp-demo-001.jpg', '/camera/east/20260329-101500.jpg',
  'tenant/default/camera/cam-east-001/snapshot/ftp-upload/2026/03/29/thumb/ftp-demo-001-thumb.jpg', 'image/jpeg', 1280, 720, '演示 FTP 抓图结果'
FROM `iot_cameras` c
WHERE c.camera_code = 'CAM-EAST-001'
  AND c.tenant_id = @default_tenant_id
  AND NOT EXISTS (SELECT 1 FROM `iot_camera_snapshots` s WHERE s.snapshot_no = 'FTP-DEMO-001');

INSERT INTO `sys_configs`
  (`tenant_id`, `config_group`, `config_key`, `config_name`, `config_value_json`, `description`, `updated_by`)
VALUES
  (@default_tenant_id, 'base', 'platform_name', '平台名称', JSON_QUOTE('智能农业环境监测平台'), '后台平台显示名称', 1),
  (@default_tenant_id, 'base', 'default_timezone', '默认时区', JSON_QUOTE('Asia/Shanghai'), '系统默认时区', 1),
  (@default_tenant_id, 'base', 'data_retention_days', '数据保留周期(天)', '365', '历史数据保留天数', 1),
  (@default_tenant_id, 'alerts', 'default_severity', '默认告警级别', JSON_QUOTE('medium'), '新建规则默认告警级别', 1),
  (@default_tenant_id, 'alerts', 'reopen_upgrade_threshold', '告警重开升级阈值', '3', '超过该次数后升级提醒', 1),
  (@default_tenant_id, 'alerts', 'default_recovery_policy', '默认恢复策略', JSON_QUOTE('manual_close'), '规则默认恢复策略', 1),
  (@default_tenant_id, 'control_safety', 'max_run_seconds', '单次最大运行时长(秒)', '1800', '执行器单次运行上限', 1),
  (@default_tenant_id, 'control_safety', 'backfill_control_policy', '补传期间控制策略', JSON_QUOTE('warn'), 'warn 表示允许控制但给出提示', 1),
  (@default_tenant_id, 'control_safety', 'allow_force_control', '是否允许强制控制', 'true', '是否开放高危强制控制', 1),
  (@default_tenant_id, 'control_safety', 'mutex_conflict_policy', '互斥冲突策略', JSON_QUOTE('reject'), '互斥资源冲突时的处理方式', 1),
  (@default_tenant_id, 'ai_scheduler', 'auto_daily_report_enabled', '是否启用自动日报', 'false', '测试阶段默认关闭，避免自动生成日报', 1),
  (@default_tenant_id, 'ai_scheduler', 'daily_report_time', '日报生成时间', JSON_QUOTE('08:30'), '每日自动日报生成时间', 1),
  (@default_tenant_id, 'ai_scheduler', 'auto_weekly_report_enabled', '是否启用自动周报', 'false', '测试阶段默认关闭，避免自动生成周报', 1),
  (@default_tenant_id, 'ai_scheduler', 'weekly_report_time', '周报生成时间', JSON_QUOTE('MON 08:30'), '每周自动周报时间', 1),
  (@default_tenant_id, 'ai_scheduler', 'event_diagnosis_enabled', '是否启用事件触发诊断', 'false', '测试阶段默认关闭，避免告警自动触发诊断', 1),
  (@default_tenant_id, 'ai_scheduler', 'cooldown_minutes', '事件触发冷却时间(分钟)', '30', 'AI诊断冷却时间', 1),
  (@default_tenant_id, 'ai_scheduler', 'max_concurrency', 'AI最大并发任务数', '3', '并行执行 AI 任务上限', 1),
  (@default_tenant_id, 'ai_scheduler', 'max_queue_size', '最大排队任务数', '100', 'AI 队列排队上限', 1),
  (@default_tenant_id, 'ai_scheduler', 'retry_count', '失败重试次数', '2', 'AI 任务失败后的重试次数', 1),
  (@default_tenant_id, 'ai_scheduler', 'retry_interval_minutes', '重试间隔(分钟)', '15', 'AI 任务重试间隔', 1),
  (@default_tenant_id, 'permission_security', 'force_logout_on_sensitive_change', '高危权限变更强制下线', 'true', '高危权限变更后立即失效旧会话', 1),
  (@default_tenant_id, 'permission_security', 'temporary_permission_notice_hours', '临时授权到期提醒(小时)', '24', '临时权限到期前提醒阈值', 1),
  (@default_tenant_id, 'permission_security', 'expiry_notice_targets', '到期提醒对象', JSON_ARRAY('admin', 'ops'), '到期提醒接收角色', 1),
  (@default_tenant_id, 'gateway', 'backfill_batch_size', '补传批量大小', '200', '网关单次补传数据量', 1),
  (@default_tenant_id, 'gateway', 'heartbeat_interval_seconds', '心跳间隔(秒)', '60', '网关心跳上报间隔', 1),
  (@default_tenant_id, 'gateway', 'cache_upper_limit', '缓存上限', '500', '离线缓存条数上限', 1),
  (@default_tenant_id, 'gateway', 'time_sync_policy', '时间同步策略', JSON_QUOTE('ntp_preferred'), '网关时钟同步优先策略', 1)
ON DUPLICATE KEY UPDATE
  `tenant_id` = VALUES(`tenant_id`),
  `config_name` = VALUES(`config_name`),
  `config_value_json` = VALUES(`config_value_json`),
  `description` = VALUES(`description`),
  `updated_by` = VALUES(`updated_by`);

INSERT INTO `sys_tenant_plans`
  (`plan_code`, `plan_name`, `plan_level`, `billing_cycle`, `status`, `description`, `features_json`, `limits_json`, `is_builtin`)
VALUES
  (
    'trial',
    '试用版',
    10,
    'trial',
    'enabled',
    '适合试用和演示环境',
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
    '适合中小规模农业数字化场景',
    JSON_OBJECT('enable_ai', true, 'enable_media', true, 'enable_openclaw', true, 'enable_alert_notifications', true),
    JSON_OBJECT('max_users', 20, 'max_gateways', 10, 'max_cameras', 8, 'max_ai_tasks_per_day', 100),
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
  (`tenant_id`, `plan_id`, `subscription_status`, `starts_at`, `expires_at`, `remark`, `updated_by`)
SELECT
  @default_tenant_id,
  p.id,
  'active',
  NOW(),
  NULL,
  '默认租户内置套餐',
  1
FROM `sys_tenant_plans` p
WHERE p.plan_code = 'internal'
  AND NOT EXISTS (
    SELECT 1
    FROM `sys_tenant_subscriptions` s
    WHERE s.tenant_id = @default_tenant_id
  )
LIMIT 1;
