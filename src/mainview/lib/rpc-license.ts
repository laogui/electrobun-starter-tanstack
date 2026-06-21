import {
  rpcActivateLicense as activateLicenseTransport,
  rpcCheckLicense as checkLicenseTransport,
  type LicenseInfo,
} from '@/lib/rpc';

export type { LicenseInfo } from '@/lib/rpc';

let cachedLicense: LicenseInfo | null = null;
let refreshPromise: Promise<LicenseInfo | null> | null = null;

export function getCachedLicense(): LicenseInfo | null {
  return cachedLicense;
}

export function refreshLicense(): Promise<LicenseInfo | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = checkLicenseTransport()
    .then((license) => {
      if (license) {
        cachedLicense = license;
      }
      return license;
    })
    .catch((error) => {
      console.error('[License] Check failed:', error);
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/** Compatibility name for existing license status consumers. */
export function rpcCheckLicense(): Promise<LicenseInfo | null> {
  return refreshLicense();
}

export async function rpcActivateLicense(
  key: string
): Promise<{ success: boolean; error?: string } | null> {
  const result = await activateLicenseTransport(key);
  if (result?.success) {
    cachedLicense = { ...cachedLicense, activated: true };
    await refreshLicense();
  }
  return result;
}
