/**
 * Mock License API for local testing
 * 用于本地测试的模拟 API
 *
 * 使用方式:
 * import { mockLicenseAPI } from '@/lib/license-api-mock';
 * mockLicenseAPI.activate('GHOST-...', 'device-123');
 */

export interface LicenseInfo {
  activated: boolean;
  activatedAt?: string;
  deviceId?: string;
  features?: {
    unlimitedCards: boolean;
  };
  key: string;
}

// 模拟存储
const mockStorage = {
  licenses: new Map<string, any>(),
  activations: new Map<string, any[]>(),
};

// 预设的测试许可证
const TEST_LICENSES = [
  'GHOST-A1B2-C3D4-E5F6-7890', // 有效
  'GHOST-1234-5678-90AB-CDEF', // 有效
  'GHOST-AAAA-BBBB-CCCC-DDDD', // 有效
];

// 初始化测试数据
TEST_LICENSES.forEach((key) => {
  mockStorage.licenses.set(key, {
    key,
    email: 'test@example.com',
    plan: 'lifetime',
    status: 'unused',
    deviceId: null,
    deviceInfo: null,
    activatedAt: null,
    createdAt: new Date().toISOString(),
  });
});

export const mockLicenseAPI = {
  /**
   * 激活许可证
   */
  async activate(
    key: string,
    deviceId: string,
    deviceInfo?: Record<string, any>
  ): Promise<{ success: boolean; license?: LicenseInfo; error?: string }> {
    // 模拟网络延迟
    await new Promise((resolve) => setTimeout(resolve, 500));

    const license = mockStorage.licenses.get(key);

    if (!license) {
      return {
        success: false,
        error: 'Invalid license key',
      };
    }

    if (license.deviceId && license.deviceId !== deviceId) {
      return {
        success: false,
        error: 'License already activated on another device',
      };
    }

    // 激活
    license.status = 'active';
    license.deviceId = deviceId;
    license.deviceInfo = deviceInfo;
    license.activatedAt = new Date().toISOString();

    // 记录激活历史
    if (!mockStorage.activations.has(key)) {
      mockStorage.activations.set(key, []);
    }
    mockStorage.activations.get(key)!.push({
      deviceId,
      deviceInfo,
      activatedAt: license.activatedAt,
    });

    return {
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
    };
  },

  /**
   * 验证许可证
   */
  async verify(
    key: string,
    deviceId: string
  ): Promise<{ success: boolean; valid: boolean; license?: LicenseInfo }> {
    // 模拟网络延迟
    await new Promise((resolve) => setTimeout(resolve, 300));

    const license = mockStorage.licenses.get(key);

    if (!license || license.deviceId !== deviceId) {
      return {
        success: true,
        valid: false,
      };
    }

    return {
      success: true,
      valid: true,
      license: {
        key,
        activated: license.status === 'active',
        activatedAt: license.activatedAt,
        deviceId: license.deviceId,
        features: {
          unlimitedCards: true,
        },
      },
    };
  },

  /**
   * 获取测试许可证
   */
  getTestLicenses(): string[] {
    return [...TEST_LICENSES];
  },

  /**
   * 重置 Mock 数据
   */
  reset(): void {
    mockStorage.licenses.clear();
    mockStorage.activations.clear();
    TEST_LICENSES.forEach((key) => {
      mockStorage.licenses.set(key, {
        key,
        email: 'test@example.com',
        plan: 'lifetime',
        status: 'unused',
        deviceId: null,
        deviceInfo: null,
        activatedAt: null,
        createdAt: new Date().toISOString(),
      });
    });
  },
};

// 打印测试许可证到控制台
if (import.meta.env.DEV) {
  console.log('[Mock License API] Test licenses available:');
  TEST_LICENSES.forEach((key, i) => {
    console.log(`  ${i + 1}. ${key}`);
  });
}
