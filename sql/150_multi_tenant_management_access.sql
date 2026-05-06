SET @default_tenant_id = (
  SELECT id
  FROM sys_tenants
  WHERE is_default = 1
     OR tenant_code = 'default'
  ORDER BY is_default DESC, id ASC
  LIMIT 1
);

INSERT INTO sys_permissions
  (permission_code, permission_name, module_code, permission_type, route_path, description)
VALUES
  ('tenant:manage', '租户管理', 'system', 'page', '/system/tenants', '管理租户主档与默认租户')
ON DUPLICATE KEY UPDATE
  permission_name = VALUES(permission_name),
  module_code = VALUES(module_code),
  permission_type = VALUES(permission_type),
  route_path = VALUES(route_path),
  description = VALUES(description);

INSERT INTO sys_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM sys_roles r
JOIN sys_permissions p ON p.permission_code = 'tenant:manage'
WHERE r.role_code = 'super_admin'
  AND r.tenant_id = @default_tenant_id
ON DUPLICATE KEY UPDATE permission_id = VALUES(permission_id);

DELETE rp
FROM sys_role_permissions rp
JOIN sys_roles r ON r.id = rp.role_id
JOIN sys_permissions p ON p.id = rp.permission_id
WHERE p.permission_code = 'tenant:manage'
  AND NOT (r.role_code = 'super_admin' AND r.tenant_id = @default_tenant_id);
