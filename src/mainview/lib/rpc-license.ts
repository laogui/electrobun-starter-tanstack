/**
 * 许可证相关的 RPC 客户端函数
 */

export interface LicenseInfo {
  activated: boolean;
  activatedAt?: number;
  fingerprint?: string;
  key?: string;
}

let initPromise: Promise<any> | null = null;
let notElectrobun = false;

async function getElectrobun() {
  if (notElectrobun) {
    return null;
  }

  if (!initPromise) {
    if ((globalThis as any).__electrobunWebviewId === undefined) {
      console.warn('[license] Not running inside Electrobun');
      notElectrobun = true;
      return null;
    }

    initPromise = import('electrobun/view')
      .then((mod) => {
        const Electrobun = mod.default;
        const { Electroview } = mod;
        const rpc = Electroview.defineRPC({
          maxRequestTime: 5000,
          handlers: { requests: {}, messages: {} },
        });
        return new Electrobun.Electroview({ rpc });
      })
      .catch((error) => {
        console.warn('[license] Failed to initialize Electrobun RPC:', error);
        return null;
      });
  }

  return await initPromise;
}

/**
 * 检查许可证状态
 */
export async function rpcCheckLicense(): Promise<LicenseInfo | null> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.checkLicense({});
}

/**
 * 激活许可证
 */
export async function rpcActivateLicense(
  key: string
): Promise<{ success: boolean; error?: string } | null> {
  const eb = await getElectrobun();
  if (!eb?.rpc) {
    return null;
  }
  return eb.rpc.request.activateLicense({ key });
}
