# GhostBoard 许可证管理后端 API

## API 设计

### 基础信息

- **Base URL**: `https://api.yourapp.com/v1`
- **认证**: API Key (可选,用于管理端点)
- **数据格式**: JSON

### 端点列表

#### 1. 生成许可证 (管理员)

```http
POST /admin/licenses
Authorization: Bearer {ADMIN_API_KEY}
Content-Type: application/json

{
  "email": "user@example.com",
  "plan": "lifetime",
  "quantity": 1
}
```

**响应:**
```json
{
  "success": true,
  "licenses": [
    {
      "key": "GHOST-A1B2-C3D4-E5F6-7H8I",
      "email": "user@example.com",
      "createdAt": "2026-06-13T10:00:00Z",
      "status": "unused"
    }
  ]
}
```

#### 2. 激活许可证

```http
POST /licenses/activate
Content-Type: application/json

{
  "key": "GHOST-A1B2-C3D4-E5F6-7H8I",
  "deviceId": "abc123...",
  "deviceInfo": {
    "platform": "darwin",
    "arch": "arm64",
    "hostname": "MacBook-Pro"
  }
}
```

**响应 (成功):**
```json
{
  "success": true,
  "license": {
    "key": "GHOST-A1B2-C3D4-E5F6-7H8I",
    "activated": true,
    "activatedAt": "2026-06-13T10:05:00Z",
    "deviceId": "abc123...",
    "features": {
      "unlimitedCards": true
    }
  }
}
```

**响应 (失败):**
```json
{
  "success": false,
  "error": "INVALID_KEY",
  "message": "License key is invalid or has expired"
}
```

#### 3. 验证许可证

```http
POST /licenses/verify
Content-Type: application/json

{
  "key": "GHOST-A1B2-C3D4-E5F6-7H8I",
  "deviceId": "abc123..."
}
```

**响应:**
```json
{
  "success": true,
  "valid": true,
  "license": {
    "activated": true,
    "features": {
      "unlimitedCards": true
    }
  }
}
```

#### 4. 获取许可证状态

```http
GET /licenses/{key}?deviceId=abc123...
```

**响应:**
```json
{
  "success": true,
  "license": {
    "key": "GHOST-****-****-****-7H8I",
    "activated": true,
    "activatedAt": "2026-06-13T10:05:00Z",
    "deviceId": "abc123...",
    "features": {
      "unlimitedCards": true
    }
  }
}
```

### 错误码

| 错误码 | 说明 |
|--------|------|
| `INVALID_KEY` | 许可证密钥无效 |
| `KEY_NOT_FOUND` | 许可证不存在 |
| `ALREADY_ACTIVATED` | 许可证已在其他设备激活 |
| `EXPIRED` | 许可证已过期 |
| `REVOKED` | 许可证已被撤销 |
| `DEVICE_MISMATCH` | 设备不匹配 |

### 数据库 Schema

#### licenses 表

```sql
CREATE TABLE licenses (
  id SERIAL PRIMARY KEY,
  key VARCHAR(29) UNIQUE NOT NULL,
  email VARCHAR(255),
  plan VARCHAR(50) NOT NULL DEFAULT 'lifetime',
  status VARCHAR(20) NOT NULL DEFAULT 'unused',
  device_id VARCHAR(255),
  device_info JSONB,
  activated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP
);

CREATE INDEX idx_licenses_key ON licenses(key);
CREATE INDEX idx_licenses_device_id ON licenses(device_id);
CREATE INDEX idx_licenses_status ON licenses(status);
```

#### activations 表 (可选,用于跟踪激活历史)

```sql
CREATE TABLE activations (
  id SERIAL PRIMARY KEY,
  license_key VARCHAR(29) NOT NULL,
  device_id VARCHAR(255) NOT NULL,
  device_info JSONB,
  ip_address VARCHAR(45),
  activated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (license_key) REFERENCES licenses(key)
);

CREATE INDEX idx_activations_license ON activations(license_key);
CREATE INDEX idx_activations_device ON activations(device_id);
```

### 安全建议

1. **HTTPS Only** - 所有 API 必须使用 HTTPS
2. **Rate Limiting** - 限制激活和验证请求频率
3. **IP 白名单** - 管理员端点使用 IP 白名单
4. **设备限制** - 一个许可证只能绑定一个设备
5. **日志审计** - 记录所有激活和验证请求
