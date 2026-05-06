ALTER TABLE `iot_gateways`
  ADD COLUMN IF NOT EXISTS `sampling_status` VARCHAR(32) NOT NULL DEFAULT 'running' COMMENT '采集状态：running/paused' AFTER `runtime_mode`,
  ADD COLUMN IF NOT EXISTS `desired_sampling_status` VARCHAR(32) NOT NULL DEFAULT 'running' COMMENT '期望采集状态：running/paused' AFTER `sampling_status`,
  ADD COLUMN IF NOT EXISTS `sampling_command_version` INT NOT NULL DEFAULT 0 COMMENT '采集控制命令版本' AFTER `desired_sampling_status`,
  ADD COLUMN IF NOT EXISTS `applied_command_version` INT NOT NULL DEFAULT 0 COMMENT '设备已应用命令版本' AFTER `sampling_command_version`,
  ADD COLUMN IF NOT EXISTS `last_sampling_command_at` DATETIME DEFAULT NULL COMMENT '最近下发采集控制时间' AFTER `applied_command_version`,
  ADD COLUMN IF NOT EXISTS `last_sampling_reported_at` DATETIME DEFAULT NULL COMMENT '最近回报采集状态时间' AFTER `last_sampling_command_at`;
