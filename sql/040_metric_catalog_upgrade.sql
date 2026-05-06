USE `agri_iot_platform_dev`;

CREATE TABLE IF NOT EXISTS `iot_metric_defs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '指标定义主键',
  `metric_code` VARCHAR(64) NOT NULL COMMENT '指标编码',
  `metric_name` VARCHAR(64) NOT NULL COMMENT '指标名称',
  `category_code` VARCHAR(32) NOT NULL DEFAULT 'environment' COMMENT '指标分类：environment/soil/water/device/custom',
  `unit_name` VARCHAR(32) DEFAULT NULL COMMENT '默认单位',
  `value_type` VARCHAR(16) NOT NULL DEFAULT 'decimal' COMMENT '取值类型：decimal/integer/text/boolean',
  `precision_scale` INT NOT NULL DEFAULT 2 COMMENT '小数位数',
  `normal_min` DECIMAL(18,4) DEFAULT NULL COMMENT '正常最小值',
  `normal_max` DECIMAL(18,4) DEFAULT NULL COMMENT '正常最大值',
  `warn_min` DECIMAL(18,4) DEFAULT NULL COMMENT '告警最小阈值',
  `warn_max` DECIMAL(18,4) DEFAULT NULL COMMENT '告警最大阈值',
  `chart_color` VARCHAR(32) DEFAULT NULL COMMENT '图表颜色',
  `sort_order` INT NOT NULL DEFAULT 100 COMMENT '排序值',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_metric_defs_metric_code` (`metric_code`),
  KEY `idx_iot_metric_defs_enabled_sort_order` (`enabled`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='指标字典表';

CREATE TABLE IF NOT EXISTS `iot_sensor_channels` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '传感器通道主键',
  `sensor_id` BIGINT UNSIGNED NOT NULL COMMENT '传感器ID',
  `channel_code` VARCHAR(64) NOT NULL COMMENT '通道编号',
  `channel_name` VARCHAR(128) NOT NULL COMMENT '通道名称',
  `metric_code` VARCHAR(64) NOT NULL COMMENT '指标编码',
  `register_address` INT DEFAULT NULL COMMENT '寄存器地址',
  `register_length` INT NOT NULL DEFAULT 1 COMMENT '寄存器长度',
  `scale_factor` DECIMAL(18,6) NOT NULL DEFAULT 1.000000 COMMENT '缩放系数',
  `offset_value` DECIMAL(18,6) NOT NULL DEFAULT 0.000000 COMMENT '偏移值',
  `unit_name` VARCHAR(32) DEFAULT NULL COMMENT '通道单位',
  `channel_order` INT NOT NULL DEFAULT 1 COMMENT '通道排序',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_iot_sensor_channels_sensor_channel_code` (`sensor_id`, `channel_code`),
  KEY `idx_iot_sensor_channels_metric_code` (`metric_code`, `enabled`),
  CONSTRAINT `fk_iot_sensor_channels_sensor_id` FOREIGN KEY (`sensor_id`) REFERENCES `iot_sensors` (`id`),
  CONSTRAINT `fk_iot_sensor_channels_metric_code` FOREIGN KEY (`metric_code`) REFERENCES `iot_metric_defs` (`metric_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='传感器指标通道表';

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

INSERT INTO `iot_sensor_channels`
  (`sensor_id`, `channel_code`, `channel_name`, `metric_code`, `register_address`, `register_length`,
   `scale_factor`, `offset_value`, `unit_name`, `channel_order`, `enabled`, `remark`)
SELECT
  s.id,
  CONCAT('CH-', LPAD(s.id, 4, '0')),
  CONCAT(s.sensor_name, '通道'),
  s.sensor_type,
  NULL,
  1,
  1.000000,
  0.000000,
  s.unit_name,
  1,
  CASE WHEN s.sensor_status = 'enabled' THEN 1 ELSE 0 END,
  '由升级脚本自动初始化'
FROM `iot_sensors` s
LEFT JOIN `iot_sensor_channels` c
  ON c.sensor_id = s.id
 AND c.metric_code = s.sensor_type
WHERE c.id IS NULL;
