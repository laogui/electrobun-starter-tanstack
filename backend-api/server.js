/**
 * GhostBoard 许可证管理后端 API
 * Node.js + Express 实现
 *
 * 安装依赖:
 * npm install express cors helmet express-rate-limit dotenv pg
 *
 * 运行:
 * node server.js
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  })
);
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 限制100次请求
});
app.use('/api/v1/', limiter);

// 内存数据库 (生产环境请使用 PostgreSQL/MySQL)
const licenses = new Map();
const activations = new Map();

// 辅助函数: 生成许可证密钥
function generateLicenseKey() {
  const segment1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const segment2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const segment3 = crypto.randomBytes(2).toString('hex').toUpperCase();

  const checksum = crypto
    .createHash('md5')
    .update(`${segment1}${segment2}${segment3}`)
    .digest('hex')
    .substring(0, 4)
    .toUpperCase();

  return `GHOST-${segment1}-${segment2}-${segment3}-${checksum}`;
}

// 辅助函数: 验证许可证格式
function validateLicenseKeyFormat(key) {
  if (!/^GHOST-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(key)) {
    return false;
  }

  const parts = key.split('-').slice(1);
  const checksum = parts.slice(0, 3).join('');
  const expectedCheck = crypto
    .createHash('md5')
    .update(checksum)
    .digest('hex')
    .substring(0, 4)
    .toUpperCase();

  return parts[3] === expectedCheck;
}

// 管理员认证中间件
function adminAuth(req, res, next) {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

// ============================================================================
// API 端点
// ============================================================================

// 健康检查
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 1. 生成许可证 (管理员)
app.post('/api/v1/admin/licenses', adminAuth, (req, res) => {
  const { email, plan = 'lifetime', quantity = 1 } = req.body;

  const generatedLicenses = [];

  for (let i = 0; i < quantity; i++) {
    const key = generateLicenseKey();
    const license = {
      key,
      email,
      plan,
      status: 'unused',
      deviceId: null,
      deviceInfo: null,
      activatedAt: null,
      createdAt: new Date().toISOString(),
      expiresAt: null, // lifetime 无过期时间
      revokedAt: null,
    };

    licenses.set(key, license);
    generatedLicenses.push({
      key,
      email,
      createdAt: license.createdAt,
      status: license.status,
    });
  }

  res.json({
    success: true,
    licenses: generatedLicenses,
  });
});

// 2. 激活许可证
app.post('/api/v1/licenses/activate', (req, res) => {
  const { key, deviceId, deviceInfo } = req.body;

  if (!(key && deviceId)) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_FIELDS',
      message: 'License key and device ID are required',
    });
  }

  if (!validateLicenseKeyFormat(key)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_KEY',
      message: 'Invalid license key format',
    });
  }

  const license = licenses.get(key);

  if (!license) {
    return res.status(404).json({
      success: false,
      error: 'KEY_NOT_FOUND',
      message: 'License key not found',
    });
  }

  if (license.revokedAt) {
    return res.status(403).json({
      success: false,
      error: 'REVOKED',
      message: 'License has been revoked',
    });
  }

  // 检查是否已激活到其他设备
  if (license.deviceId && license.deviceId !== deviceId) {
    return res.status(403).json({
      success: false,
      error: 'ALREADY_ACTIVATED',
      message: 'License is already activated on another device',
    });
  }

  // 激活许可证
  license.status = 'active';
  license.deviceId = deviceId;
  license.deviceInfo = deviceInfo;
  license.activatedAt = new Date().toISOString();

  // 记录激活历史
  if (!activations.has(key)) {
    activations.set(key, []);
  }
  activations.get(key).push({
    deviceId,
    deviceInfo,
    ipAddress: req.ip,
    activatedAt: license.activatedAt,
  });

  res.json({
    success: true,
    license: {
      key,
      activated: true,
      activatedAt: license.activatedAt,
      deviceId: license.deviceId,
      features: {
        unlimitedCards: true,
      },
    },
  });
});

// 3. 验证许可证
app.post('/api/v1/licenses/verify', (req, res) => {
  const { key, deviceId } = req.body;

  if (!(key && deviceId)) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_FIELDS',
      message: 'License key and device ID are required',
    });
  }

  const license = licenses.get(key);

  if (!license) {
    return res.json({
      success: true,
      valid: false,
      reason: 'KEY_NOT_FOUND',
    });
  }

  if (license.revokedAt) {
    return res.json({
      success: true,
      valid: false,
      reason: 'REVOKED',
    });
  }

  if (license.deviceId !== deviceId) {
    return res.json({
      success: true,
      valid: false,
      reason: 'DEVICE_MISMATCH',
    });
  }

  res.json({
    success: true,
    valid: true,
    license: {
      activated: license.status === 'active',
      activatedAt: license.activatedAt,
      features: {
        unlimitedCards: true,
      },
    },
  });
});

// 4. 获取许可证状态
app.get('/api/v1/licenses/:key', (req, res) => {
  const { key } = req.params;
  const { deviceId } = req.query;

  const license = licenses.get(key);

  if (!license) {
    return res.status(404).json({
      success: false,
      error: 'KEY_NOT_FOUND',
    });
  }

  // 隐藏完整密钥
  const maskedKey = `GHOST-****-****-****-${key.split('-')[4]}`;

  res.json({
    success: true,
    license: {
      key: maskedKey,
      activated: license.status === 'active',
      activatedAt: license.activatedAt,
      deviceId: license.deviceId === deviceId ? license.deviceId : null,
      features: {
        unlimitedCards: license.status === 'active',
      },
    },
  });
});

// 5. 撤销许可证 (管理员)
app.post('/api/v1/admin/licenses/:key/revoke', adminAuth, (req, res) => {
  const { key } = req.params;

  const license = licenses.get(key);

  if (!license) {
    return res.status(404).json({
      success: false,
      error: 'KEY_NOT_FOUND',
    });
  }

  license.status = 'revoked';
  license.revokedAt = new Date().toISOString();

  res.json({
    success: true,
    message: 'License revoked successfully',
  });
});

// 6. 获取激活历史 (管理员)
app.get('/api/v1/admin/licenses/:key/activations', adminAuth, (req, res) => {
  const { key } = req.params;

  const history = activations.get(key) || [];

  res.json({
    success: true,
    activations: history,
  });
});

// 错误处理
app.use((err, _req, res, _nextt) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message:
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'Internal server error',
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 License API server running on port ${PORT}`);
  console.log(`📍 Base URL: http://localhost:${PORT}/api/v1`);
  console.log(`🔑 Admin API Key: ${process.env.ADMIN_API_KEY || 'NOT_SET'}`);
});
