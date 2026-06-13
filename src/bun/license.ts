import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { Utils } from 'electrobun/bun';

// API Configuration
const _API_BASE_URL =
  process.env.LICENSE_API_URL || 'http://localhost:3001/api/v1';
const _USE_ONLINE_VALIDATION = process.env.USE_ONLINE_LICENSE === 'true';

/**
 * 订阅许可证管理模块
 * 使用硬件绑定 + 简单编码实现防篡改的本地订阅验证
 */

export interface LicenseInfo {
  /** 是否已激活 */
  activated: boolean;
  /** 激活时间戳 */
  activatedAt?: number;
  /** 硬件指纹 */
  fingerprint?: string;
  /** 许可证密钥 */
  key?: string;
}

const LICENSE_FILE = 'license.dat';
const LICENSE_KEY_PATTERN =
  /^GHOST-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * 生成设备指纹 - 基于硬件信息的唯一标识
 */
function getDeviceFingerprint(): string {
  const os = require('node:os');
  const raw = `${process.platform}${os.hostname()}${os.cpus()[0]?.model || ''}${os.totalmem()}`;
  return Bun.hash(raw).toString(16);
}

/**
 * XOR编码(与设备指纹绑定)
 */
function encode(data: string, key: string): Uint8Array {
  const bytes = new TextEncoder().encode(data);
  const keyBytes = new TextEncoder().encode(key);
  const result = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const k = keyBytes[i % keyBytes.length];
    if (b !== undefined && k !== undefined) {
      result[i] = b ^ k;
    }
  }
  return result;
}

/**
 * XOR解码
 */
function decode(encoded: Uint8Array, key: string): string | null {
  try {
    const keyBytes = new TextEncoder().encode(key);
    const result = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i++) {
      const e = encoded[i];
      const k = keyBytes[i % keyBytes.length];
      if (e !== undefined && k !== undefined) {
        result[i] = e ^ k;
      }
    }
    return new TextDecoder().decode(result);
  } catch {
    return null;
  }
}

/**
 * 验证许可证密钥格式
 */
function validateKey(key: string): boolean {
  if (!LICENSE_KEY_PATTERN.test(key)) {
    return false;
  }
  const parts = key.split('-').slice(1);
  const checksum = parts.slice(0, 3).join('');
  const expected = Bun.hash(checksum).toString(16).slice(0, 4).toUpperCase();
  return parts[3] === expected;
}

/**
 * 保存许可证
 */
async function saveLicense(info: LicenseInfo): Promise<void> {
  const fp = getDeviceFingerprint();
  const data = JSON.stringify({ ...info, fingerprint: fp });
  const encoded = encode(data, fp);

  const dir = Utils.paths.userData;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  await Bun.write(join(dir, LICENSE_FILE), encoded);
}

/**
 * 加载许可证
 */
async function loadLicense(): Promise<LicenseInfo | null> {
  try {
    const path = join(Utils.paths.userData, LICENSE_FILE);
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return null;
    }

    const encoded = new Uint8Array(await file.arrayBuffer());
    const fp = getDeviceFingerprint();
    const decoded = decode(encoded, fp);
    if (!decoded) {
      return null;
    }

    const data = JSON.parse(decoded) as LicenseInfo;
    if (data.fingerprint !== fp) {
      console.warn('[license] Device fingerprint mismatch');
      return null;
    }
    return data;
  } catch (error) {
    console.error('[license] Load error:', error);
    return null;
  }
}

/**
 * 激活许可证
 */
export async function activateLicense(
  key: string
): Promise<{ success: boolean; error?: string }> {
  const trimmedKey = key.trim().toUpperCase();

  if (!validateKey(trimmedKey)) {
    return { success: false, error: 'Invalid license key format' };
  }

  await saveLicense({
    activated: true,
    key: trimmedKey,
    activatedAt: Date.now(),
  });

  return { success: true };
}

/**
 * 在线验证许可证(可选)
 */
async function verifyLicenseOnline(
  key: string,
  deviceId: string
): Promise<LicenseInfo | null> {
  try {
    const response = await fetch(`${_API_BASE_URL}/licenses/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, deviceId }),
    });

    const data = await response.json();

    if (data.success && data.valid) {
      return {
        activated: true,
        key,
        activatedAt: new Date(data.license.activatedAt).getTime(),
        fingerprint: deviceId,
      };
    }

    return null;
  } catch (error) {
    console.error('[license] Online verification failed:', error);
    return null;
  }
}

/**
 * 检查许可证状态
 */
export async function checkLicenseStatus(): Promise<LicenseInfo> {
  const license = await loadLicense();

  // 如果启用在线验证,尝试在线验证
  if (_USE_ONLINE_VALIDATION && license?.activated && license.key) {
    const fingerprint = getDeviceFingerprint();
    const onlineResult = await verifyLicenseOnline(license.key, fingerprint);

    if (onlineResult) {
      return onlineResult;
    }

    // 在线验证失败,返回未激活
    console.warn('[license] Online verification failed, license may be revoked');
    return { activated: false };
  }

  return license?.activated ? license : { activated: false };
}

/**
 * 生成许可证密钥(仅用于测试)
 */
export function generateLicenseKey(): string {
  const s1 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const s2 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const s3 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const checksum = Bun.hash(`${s1}${s2}${s3}`)
    .toString(16)
    .slice(0, 4)
    .toUpperCase();
  return `GHOST-${s1}-${s2}-${s3}-${checksum}`;
}
