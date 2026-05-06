USE `agri_iot_platform_dev`;

ALTER TABLE `biz_areas`
  ADD COLUMN `weather_location_name` VARCHAR(128) DEFAULT NULL COMMENT '天气定位名称' AFTER `growth_stage`,
  ADD COLUMN `weather_provider_ref` VARCHAR(128) DEFAULT NULL COMMENT '天气源定位编码' AFTER `weather_location_name`,
  ADD COLUMN `latitude` DECIMAL(10,6) DEFAULT NULL COMMENT '纬度' AFTER `weather_provider_ref`,
  ADD COLUMN `longitude` DECIMAL(10,6) DEFAULT NULL COMMENT '经度' AFTER `latitude`;
