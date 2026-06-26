import { describe, expect, it, vi } from 'vitest';

vi.mock('electrobun/bun', () => ({
  Utils: {
    paths: {
      userData: '/mock-user-data',
    },
  },
}));

const TEST_LICENSE_KEY_RE =
  /^GHOST-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

describe('license', () => {
  it('generates test license keys without Math.random', async () => {
    const randomSpy = vi.spyOn(Math, 'random');
    vi.stubGlobal('Bun', {
      hash: (value: string) =>
        Number.parseInt(
          Array.from(value)
            .map((char) => char.charCodeAt(0).toString(16))
            .join('')
            .slice(0, 12) || '0',
          16
        ),
    });
    const { generateLicenseKey } = await import('./license');

    const key = generateLicenseKey();

    expect(key).toMatch(TEST_LICENSE_KEY_RE);
    expect(randomSpy).not.toHaveBeenCalled();
  });
});
