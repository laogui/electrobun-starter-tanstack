import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookupMock = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

const { assertPublicTarget, isObviouslyNonPublicHost, OutboundTargetError } =
  await import('./publicTarget');

beforeEach(() => {
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

describe('isObviouslyNonPublicHost', () => {
  it.each([
    'localhost',
    'foo.localhost',
    'printer.local',
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '[::1]',
    '[fd00::1]',
    '[::ffff:192.168.0.1]',
  ])('refuses %s without DNS', (host) => {
    expect(isObviouslyNonPublicHost(host)).toBe(true);
  });

  it('lets public names and addresses through to DNS', () => {
    expect(isObviouslyNonPublicHost('example.com')).toBe(false);
    expect(isObviouslyNonPublicHost('93.184.216.34')).toBe(false);
  });
});

describe('assertPublicTarget', () => {
  it('accepts a name that resolves only to public addresses', async () => {
    await expect(
      assertPublicTarget(new URL('https://example.com/a'))
    ).resolves.toBeUndefined();
    expect(lookupMock).toHaveBeenCalledWith('example.com', { all: true });
  });

  it.each([
    '10.0.0.1',
    '169.254.169.254',
    '127.0.0.1',
    '::1',
    'fe80::1',
    '::ffff:10.0.0.1',
  ])('rejects a public-looking name that resolves to %s', async (address) => {
    lookupMock.mockResolvedValue([{ address, family: 4 }]);
    await expect(
      assertPublicTarget(new URL('https://evil.example/'))
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('rejects when any of several addresses is private', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.1.1', family: 4 },
    ]);
    await expect(
      assertPublicTarget(new URL('https://mixed.example/'))
    ).rejects.toBeInstanceOf(OutboundTargetError);
  });

  it('reports DNS failure as unresolved', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(
      assertPublicTarget(new URL('https://nowhere.example/'))
    ).rejects.toMatchObject({ code: 'unresolved' });
  });

  it('allows loopback only when explicitly requested', async () => {
    await expect(
      assertPublicTarget(new URL('http://127.0.0.1:3000/'))
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      assertPublicTarget(new URL('http://127.0.0.1:3000/'), {
        allowLoopback: true,
      })
    ).resolves.toBeUndefined();
  });
});
