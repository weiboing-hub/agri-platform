CREATE TABLE IF NOT EXISTS sys_refresh_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  token_digest CHAR(64) NOT NULL COMMENT '刷新令牌摘要',
  token_jti VARCHAR(64) NOT NULL COMMENT '刷新令牌唯一标识',
  client_ip VARCHAR(64) DEFAULT NULL COMMENT '客户端IP',
  user_agent VARCHAR(255) DEFAULT NULL COMMENT '客户端UA',
  issued_at DATETIME NOT NULL COMMENT '签发时间',
  expires_at DATETIME NOT NULL COMMENT '过期时间',
  last_used_at DATETIME DEFAULT NULL COMMENT '最近使用时间',
  revoked_at DATETIME DEFAULT NULL COMMENT '吊销时间',
  replaced_by_token_digest CHAR(64) DEFAULT NULL COMMENT '被轮换后的新令牌摘要',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_refresh_tokens_digest (token_digest),
  KEY idx_sys_refresh_tokens_user (user_id),
  KEY idx_sys_refresh_tokens_expires (expires_at),
  KEY idx_sys_refresh_tokens_revoked (revoked_at),
  CONSTRAINT fk_sys_refresh_tokens_user
    FOREIGN KEY (user_id) REFERENCES sys_users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='刷新令牌会话表';
