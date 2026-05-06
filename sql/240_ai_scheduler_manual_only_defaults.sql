UPDATE `sys_configs`
SET `config_value_json` = 'false',
    `description` = '测试阶段默认关闭，避免自动生成报告',
    `updated_at` = NOW()
WHERE `config_group` = 'ai_scheduler'
  AND `config_key` IN (
    'auto_daily_report_enabled',
    'auto_weekly_report_enabled',
    'event_diagnosis_enabled'
  );
