SET @db_name = DATABASE();

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'iot_camera_capture_jobs'
      AND column_name = 'tenant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `iot_camera_capture_jobs` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT ''所属租户ID'' AFTER `job_no`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `iot_camera_capture_jobs` j
JOIN `iot_cameras` c ON c.id = j.camera_id
SET j.tenant_id = c.tenant_id
WHERE j.tenant_id IS NULL;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'iot_camera_capture_jobs'
      AND index_name = 'idx_iot_camera_capture_jobs_tenant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `iot_camera_capture_jobs` ADD KEY `idx_iot_camera_capture_jobs_tenant_id` (`tenant_id`, `status`, `scheduled_at`)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = @db_name
      AND table_name = 'iot_camera_capture_jobs'
      AND constraint_name = 'fk_iot_camera_capture_jobs_tenant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `iot_camera_capture_jobs` ADD CONSTRAINT `fk_iot_camera_capture_jobs_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'iot_camera_snapshots'
      AND column_name = 'tenant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `iot_camera_snapshots` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT ''所属租户ID'' AFTER `snapshot_no`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `iot_camera_snapshots` s
JOIN `iot_cameras` c ON c.id = s.camera_id
SET s.tenant_id = c.tenant_id
WHERE s.tenant_id IS NULL;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'iot_camera_snapshots'
      AND index_name = 'idx_iot_camera_snapshots_tenant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `iot_camera_snapshots` ADD KEY `idx_iot_camera_snapshots_tenant_id` (`tenant_id`, `captured_at`)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = @db_name
      AND table_name = 'iot_camera_snapshots'
      AND constraint_name = 'fk_iot_camera_snapshots_tenant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `iot_camera_snapshots` ADD CONSTRAINT `fk_iot_camera_snapshots_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'iot_camera_recordings'
      AND column_name = 'tenant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `iot_camera_recordings` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT ''所属租户ID'' AFTER `recording_no`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `iot_camera_recordings` r
JOIN `iot_cameras` c ON c.id = r.camera_id
SET r.tenant_id = c.tenant_id
WHERE r.tenant_id IS NULL;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'iot_camera_recordings'
      AND index_name = 'idx_iot_camera_recordings_tenant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `iot_camera_recordings` ADD KEY `idx_iot_camera_recordings_tenant_id` (`tenant_id`, `start_time`)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = @db_name
      AND table_name = 'iot_camera_recordings'
      AND constraint_name = 'fk_iot_camera_recordings_tenant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `iot_camera_recordings` ADD CONSTRAINT `fk_iot_camera_recordings_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'ai_image_analysis_results'
      AND column_name = 'tenant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `ai_image_analysis_results` ADD COLUMN `tenant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT ''所属租户ID'' AFTER `analysis_no`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `ai_image_analysis_results` r
JOIN `iot_camera_snapshots` s ON s.id = r.snapshot_id
SET r.tenant_id = s.tenant_id
WHERE r.tenant_id IS NULL;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'ai_image_analysis_results'
      AND index_name = 'idx_ai_image_analysis_results_tenant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `ai_image_analysis_results` ADD KEY `idx_ai_image_analysis_results_tenant_id` (`tenant_id`, `analysis_type`, `created_at`)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = @db_name
      AND table_name = 'ai_image_analysis_results'
      AND constraint_name = 'fk_ai_image_analysis_results_tenant_id'
  ),
  'SELECT 1',
  'ALTER TABLE `ai_image_analysis_results` ADD CONSTRAINT `fk_ai_image_analysis_results_tenant_id` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenants` (`id`)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
