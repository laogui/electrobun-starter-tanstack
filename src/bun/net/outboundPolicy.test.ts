import { describe, expect, it } from 'vitest';

import { isIpLiteral, isPublicAddress, parseIPv6 } from './outboundPolicy';

describe('outbound address policy', () => {
  it.each([
    '8.8.8.8',
    '93.184.216.34',
    '1.1.1.1',
    '172.32.0.1',
    '100.63.255.255',
    '100.128.0.1',
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
  ])('treats %s as public', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    '0.0.0.0',
    '0.1.2.3',
    '10.0.0.1',
    '127.0.0.1',
    '127.1.2.3',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '100.64.0.1',
    '100.127.255.255',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'febf::1',
    'ff02::1',
    '::ffff:10.0.0.1',
    '::ffff:127.0.0.1',
    '[fd00::1]',
  ])('treats %s as non-public', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it('refuses addresses it cannot parse', () => {
    for (const value of ['', 'not-an-ip', '1.2.3', '1.2.3.4.5', 'gggg::1']) {
      expect(isPublicAddress(value)).toBe(false);
    }
  });

  it('maps IPv4-mapped addresses through the IPv4 rules', () => {
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
    expect(isPublicAddress('::ffff:192.168.1.1')).toBe(false);
  });

  it('expands compressed and embedded IPv6 forms', () => {
    expect(parseIPv6('::1')?.at(-1)).toBe(1);
    expect(parseIPv6('::ffff:1.2.3.4')?.slice(10)).toEqual([
      255, 255, 1, 2, 3, 4,
    ]);
    expect(parseIPv6('fe80::1%en0')?.[0]).toBe(0xfe);
    expect(parseIPv6('1:2:3:4:5:6:7:8')).toHaveLength(16);
    expect(parseIPv6('1:2:3:4:5:6:7')).toBeNull();
    expect(parseIPv6('1::2::3')).toBeNull();
  });

  it('recognizes literals so hostnames can skip DNS', () => {
    expect(isIpLiteral('10.0.0.1')).toBe(true);
    expect(isIpLiteral('[::1]')).toBe(true);
    expect(isIpLiteral('example.com')).toBe(false);
  });
});
