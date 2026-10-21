import { existsSync, mkdirSync } from 'node:fs';
import { cpus, hostname, totalmem } from 'node:os';
import { join } from 'node:path';

import { getAppDataRoot } from './appPaths';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const VERIFY_TIMEOUT_MS = 10_000;
const TRAILING_SLASH_RE = /\/+$/;

/**
 * Online verification endpoint from `LICENSE_API_URL`. There is no built-in
 * default: a license check must never go out over cleartext, so only https
 * is accepted (plain http is allowed for a loopback dev server only).
 * Returns null when unset or unsafe, which disables online verification.
 */
export function resolveLicenseApiBaseUrl(
  raw: string | undefined = process.env.LICENSE_API_URL
): string | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    console.warn('[license] LICENSE_API_URL is not a valid URL; ignoring it.');
    return null;
  }
  const loopbackHttp =
    parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== 'https:' && !loopbackHttp) {
    console.warn('[license] LICENSE_API_URL must use https; ignoring it.');
    return null;
  }
  return parsed.toString().replace(TRAILING_SLASH_RE, '');
}

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
  const raw = `${process.platform}${hostname()}${cpus()[0]?.model || ''}${totalmem()}`;
  return Bun.hash(raw).toString(16);
}

/**
 * Local obfuscation (bound to the device fingerprint).
 */
function encode(data: string, key: string): Uint8Array {
  const bytes = new TextEncoder().encode(data);
  const keyBytes = new TextEncoder().encode(key);
  const result = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const k = keyBytes[i % keyBytes.length];
    if (b !== undefined && k !== undefined) {
      // biome-ignore lint/suspicious/noBitwiseOperators: XOR is the intended byte transform.
      result[i] = b ^ k;
    }
  }
  return result;
}

/**
 * Decode local obfuscation.
 */
function decode(encoded: Uint8Array, key: string): string | null {
  try {
    const keyBytes = new TextEncoder().encode(key);
    const result = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i++) {
      const e = encoded[i];
      const k = keyBytes[i % keyBytes.length];
      if (e !== undefined && k !== undefined) {
        // biome-ignore lint/suspicious/noBitwiseOperators: XOR is the intended byte transform.
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

  const dir = getAppDataRoot();
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
    const path = join(getAppDataRoot(), LICENSE_FILE);
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
interface VerifyLicenseResponse {
  license?: {
    activatedAt: string | number;
  };
  success?: boolean;
  valid?: boolean;
}

async function verifyLicenseOnline(
  key: string,
  deviceId: string
): Promise<LicenseInfo | null> {
  const baseUrl = resolveLicenseApiBaseUrl();
  if (!baseUrl) {
    console.warn(
      '[license] Online verification is enabled but LICENSE_API_URL is missing or not https.'
    );
    return null;
  }
  try {
    const response = await fetch(`${baseUrl}/licenses/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, deviceId }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as VerifyLicenseResponse;

    if (data.success && data.valid && data.license) {
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
    console.warn(
      '[license] Online verification failed, license may be revoked'
    );
    return { activated: false };
  }

  return license?.activated ? license : { activated: false };
}
