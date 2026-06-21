import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcActivateLicenseTransport, rpcCheckLicenseTransport } = vi.hoisted(
  () => ({
    rpcActivateLicenseTransport: vi.fn(),
    rpcCheckLicenseTransport: vi.fn(),
  })
);

vi.mock('@/lib/rpc', () => ({
  rpcActivateLicense: rpcActivateLicenseTransport,
  rpcCheckLicense: rpcCheckLicenseTransport,
}));

const loadModule = async () => await import('@/lib/rpc-license');

beforeEach(() => {
  vi.resetModules();
  rpcActivateLicenseTransport.mockReset();
  rpcCheckLicenseTransport.mockReset();
});

describe('license session cache', () => {
  it('caches a successful license refresh', async () => {
    const license = { activated: true, activatedAt: 123 };
    rpcCheckLicenseTransport.mockResolvedValue(license);
    const cache = await loadModule();

    await expect(cache.refreshLicense()).resolves.toEqual(license);

    expect(cache.getCachedLicense()).toEqual(license);
    expect(rpcCheckLicenseTransport).toHaveBeenCalledTimes(1);
  });

  it('shares one transport request between concurrent refreshes', async () => {
    let resolveRequest: ((value: { activated: boolean }) => void) | undefined;
    rpcCheckLicenseTransport.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );
    const cache = await loadModule();

    const first = cache.refreshLicense();
    const second = cache.refreshLicense();
    resolveRequest?.({ activated: false });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { activated: false },
      { activated: false },
    ]);
    expect(rpcCheckLicenseTransport).toHaveBeenCalledTimes(1);
  });

  it('preserves the last cached result when a later refresh fails', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    rpcCheckLicenseTransport
      .mockResolvedValueOnce({ activated: true })
      .mockRejectedValueOnce(new Error('RPC unavailable'));
    const cache = await loadModule();

    await cache.refreshLicense();
    await expect(cache.refreshLicense()).resolves.toBeNull();

    expect(cache.getCachedLicense()).toEqual({ activated: true });
    expect(consoleError).toHaveBeenCalledWith(
      '[License] Check failed:',
      expect.any(Error)
    );
  });

  it('refreshes the cache after successful activation', async () => {
    rpcActivateLicenseTransport.mockResolvedValue({ success: true });
    rpcCheckLicenseTransport.mockResolvedValue({
      activated: true,
      activatedAt: 456,
    });
    const cache = await loadModule();

    await expect(
      cache.rpcActivateLicense('GHOST-ABCD-EFGH-IJKL-1234')
    ).resolves.toEqual({ success: true });

    expect(rpcActivateLicenseTransport).toHaveBeenCalledWith(
      'GHOST-ABCD-EFGH-IJKL-1234'
    );
    expect(rpcCheckLicenseTransport).toHaveBeenCalledTimes(1);
    expect(cache.getCachedLicense()).toEqual({
      activated: true,
      activatedAt: 456,
    });
  });
});
