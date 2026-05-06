SET @db_name = DATABASE();

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'sys_users'
      AND COLUMN_NAME = 'login_failed_attempts'
  ),
  'SELECT 1',
  "ALTER TABLE `sys_users` ADD COLUMN `login_failed_attempts` INT NOT NULL DEFAULT 0 COMMENT '连续登录失败次数' AFTER `status`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'sys_users'
      AND COLUMN_NAME = 'locked_until'
  ),
  'SELECT 1',
  "ALTER TABLE `sys_users` ADD COLUMN `locked_until` DATETIME DEFAULT NULL COMMENT '锁定截止时间' AFTER `login_failed_attempts`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db_name
      AND TABLE_NAME = 'sys_users'
      AND COLUMN_NAME = 'last_login_failed_at'
  ),
  'SELECT 1',
  "ALTER TABLE `sys_users` ADD COLUMN `last_login_failed_at` DATETIME DEFAULT NULL COMMENT '最近登录失败时间' AFTER `locked_until`"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
