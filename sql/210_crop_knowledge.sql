USE `agri_iot_platform_dev`;

SET @default_tenant_id = (
  SELECT id
  FROM `sys_tenants`
  WHERE `tenant_code` = 'default'
  LIMIT 1
);

CREATE TABLE IF NOT EXISTS `agri_crop_species` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '作物品类主键',
  `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID',
  `species_code` VARCHAR(64) NOT NULL COMMENT '作物品类编码',
  `species_name` VARCHAR(128) NOT NULL COMMENT '作物品类名称',
  `category_name` VARCHAR(128) DEFAULT NULL COMMENT '作物分类',
  `scientific_name` VARCHAR(128) DEFAULT NULL COMMENT '学名',
  `sort_order` INT NOT NULL DEFAULT 100 COMMENT '排序',
  `status` VARCHAR(32) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_agri_crop_species_tenant_code` (`tenant_id`, `species_code`),
  KEY `idx_agri_crop_species_tenant_status` (`tenant_id`, `status`),
  CONSTRAINT `fk_agri_crop_species_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='作物品类表';

CREATE TABLE IF NOT EXISTS `agri_crop_varieties` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '作物品种主键',
  `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID',
  `species_id` BIGINT UNSIGNED NOT NULL COMMENT '作物品类ID',
  `variety_code` VARCHAR(64) NOT NULL COMMENT '作物品种编码',
  `variety_name` VARCHAR(128) NOT NULL COMMENT '作物品种名称',
  `sort_order` INT NOT NULL DEFAULT 100 COMMENT '排序',
  `status` VARCHAR(32) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_agri_crop_varieties_tenant_code` (`tenant_id`, `variety_code`),
  KEY `idx_agri_crop_varieties_species_id` (`species_id`),
  KEY `idx_agri_crop_varieties_tenant_status` (`tenant_id`, `status`),
  CONSTRAINT `fk_agri_crop_varieties_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`),
  CONSTRAINT `fk_agri_crop_varieties_species_id` FOREIGN KEY (`species_id`) REFERENCES `agri_crop_species` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='作物品种表';

CREATE TABLE IF NOT EXISTS `agri_crop_growth_stages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '生长阶段主键',
  `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID',
  `species_id` BIGINT UNSIGNED NOT NULL COMMENT '作物品类ID',
  `stage_code` VARCHAR(64) NOT NULL COMMENT '阶段编码',
  `stage_name` VARCHAR(128) NOT NULL COMMENT '阶段名称',
  `stage_order` INT NOT NULL DEFAULT 10 COMMENT '阶段顺序',
  `status` VARCHAR(32) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_agri_crop_growth_stages_tenant_species_code` (`tenant_id`, `species_id`, `stage_code`),
  KEY `idx_agri_crop_growth_stages_species_id` (`species_id`),
  KEY `idx_agri_crop_growth_stages_tenant_status` (`tenant_id`, `status`),
  CONSTRAINT `fk_agri_crop_growth_stages_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`),
  CONSTRAINT `fk_agri_crop_growth_stages_species_id` FOREIGN KEY (`species_id`) REFERENCES `agri_crop_species` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='作物生长阶段表';

CREATE TABLE IF NOT EXISTS `agri_crop_target_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '作物目标主键',
  `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '所属租户ID',
  `species_id` BIGINT UNSIGNED NOT NULL COMMENT '作物品类ID',
  `variety_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '作物品种ID',
  `stage_id` BIGINT UNSIGNED NOT NULL COMMENT '生长阶段ID',
  `metric_code` VARCHAR(64) NOT NULL COMMENT '指标编码',
  `target_min` DECIMAL(12,2) DEFAULT NULL COMMENT '推荐下限',
  `target_max` DECIMAL(12,2) DEFAULT NULL COMMENT '推荐上限',
  `optimal_value` DECIMAL(12,2) DEFAULT NULL COMMENT '推荐最佳值',
  `tolerance_text` VARCHAR(255) DEFAULT NULL COMMENT '容差说明',
  `advisory_text` VARCHAR(255) DEFAULT NULL COMMENT '建议说明',
  `source_name` VARCHAR(128) DEFAULT NULL COMMENT '知识来源',
  `sort_order` INT NOT NULL DEFAULT 100 COMMENT '排序',
  `status` VARCHAR(32) NOT NULL DEFAULT 'enabled' COMMENT '状态：enabled/disabled',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_agri_crop_target_profiles_species_id` (`species_id`),
  KEY `idx_agri_crop_target_profiles_variety_id` (`variety_id`),
  KEY `idx_agri_crop_target_profiles_stage_id` (`stage_id`),
  KEY `idx_agri_crop_target_profiles_metric_code` (`metric_code`),
  KEY `idx_agri_crop_target_profiles_tenant_status` (`tenant_id`, `status`),
  CONSTRAINT `fk_agri_crop_target_profiles_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`),
  CONSTRAINT `fk_agri_crop_target_profiles_species_id` FOREIGN KEY (`species_id`) REFERENCES `agri_crop_species` (`id`),
  CONSTRAINT `fk_agri_crop_target_profiles_variety_id` FOREIGN KEY (`variety_id`) REFERENCES `agri_crop_varieties` (`id`),
  CONSTRAINT `fk_agri_crop_target_profiles_stage_id` FOREIGN KEY (`stage_id`) REFERENCES `agri_crop_growth_stages` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='作物目标画像表';

ALTER TABLE `biz_areas`
  ADD COLUMN `crop_species_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '作物品类ID' AFTER `growth_stage`,
  ADD COLUMN `crop_variety_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '作物品种ID' AFTER `crop_species_id`,
  ADD COLUMN `crop_stage_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '作物生长阶段ID' AFTER `crop_variety_id`,
  ADD KEY `idx_biz_areas_crop_species_id` (`crop_species_id`),
  ADD KEY `idx_biz_areas_crop_variety_id` (`crop_variety_id`),
  ADD KEY `idx_biz_areas_crop_stage_id` (`crop_stage_id`),
  ADD CONSTRAINT `fk_biz_areas_crop_species_id` FOREIGN KEY (`crop_species_id`) REFERENCES `agri_crop_species` (`id`),
  ADD CONSTRAINT `fk_biz_areas_crop_variety_id` FOREIGN KEY (`crop_variety_id`) REFERENCES `agri_crop_varieties` (`id`),
  ADD CONSTRAINT `fk_biz_areas_crop_stage_id` FOREIGN KEY (`crop_stage_id`) REFERENCES `agri_crop_growth_stages` (`id`);

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

UPDATE `biz_areas`
SET `crop_species_id` = @crop_species_tomato_id,
    `crop_variety_id` = @crop_variety_cherry_tomato_id,
    `crop_stage_id` = @crop_stage_tomato_flowering_id,
    `crop_type` = '番茄',
    `growth_stage` = '开花坐果期'
WHERE `tenant_id` = @default_tenant_id
  AND `area_code` = 'GH-EAST-001';
