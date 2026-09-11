const IPV4_OCTET_RE = /^\d{1,3}$/;
const IPV6_GROUP_RE = /^[0-9a-fA-F]{1,4}$/;
const BRACKETS_RE = /^\[|\]$/g;

export function parseIPv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!IPV4_OCTET_RE.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    octets.push(octet);
  }
  return octets;
}

/** Returns the 16 address bytes, or null when `value` is not an IPv6 literal. */
export function parseIPv6(value: string): number[] | null {
  const zone = value.indexOf('%');
  let text = zone === -1 ? value : value.slice(0, zone);

  // Rewrite a trailing dotted-quad (`::ffff:10.0.0.1`) into two hex groups so
  // the rest of the parser only deals with groups.
  if (text.includes('.')) {
    const colon = text.lastIndexOf(':');
    if (colon === -1) {
      return null;
    }
    const embedded = parseIPv4(text.slice(colon + 1));
    if (!embedded) {
      return null;
    }
    const high = (embedded[0]! * 256 + embedded[1]!).toString(16);
    const low = (embedded[2]! * 256 + embedded[3]!).toString(16);
    text = `${text.slice(0, colon + 1)}${high}:${low}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 1) {
    if (head.length !== 8) {
      return null;
    }
    groups = head;
  } else {
    if (head.length + tail.length > 7) {
      return null;
    }
    groups = [
      ...head,
      ...Array.from({ length: 8 - head.length - tail.length }, () => '0'),
      ...tail,
    ];
  }

  const bytes: number[] = [];
  for (const group of groups) {
    if (!IPV6_GROUP_RE.test(group)) {
      return null;
    }
    const word = Number.parseInt(group, 16);
    bytes.push(Math.floor(word / 256), word % 256);
  }
  return bytes;
}

export function isIpLiteral(hostname: string): boolean {
  const host = hostname.replace(BRACKETS_RE, '');
  return parseIPv4(host) !== null || parseIPv6(host) !== null;
}

function isPublicV4(octets: readonly number[]): boolean {
  const [a = 0, b = 0] = octets;
  if (a === 0 || a === 10 || a === 127) {
    // "this network", RFC1918 private, loopback.
    return false;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    // 100.64.0.0/10 carrier-grade NAT.
    return false;
  }
  if (a === 169 && b === 254) {
    // Link-local, which is where cloud metadata services live.
    return false;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return false;
  }
  if (a === 192 && b === 168) {
    return false;
  }
  // 224.0.0.0/4 multicast through 255.255.255.255 broadcast.
  return a < 224;
}

function isPublicV6(bytes: readonly number[]): boolean {
  const [first = 0, second = 0] = bytes;
  if (first === 0xff) {
    // ff00::/8 multicast.
    return false;
  }
  if (first === 0xfc || first === 0xfd) {
    // fc00::/7 unique local.
    return false;
  }
  if (first === 0xfe && second >= 0x80 && second <= 0xbf) {
    // fe80::/10 link-local.
    return false;
  }
  return true;
}

/**
 * True when an address is routable on the public internet.
 *
 * Anything unparseable is treated as not public: a downloader must refuse a
 * target it cannot classify rather than connect to it.
 */
export function isPublicAddress(ip: string): boolean {
  const host = ip.replace(BRACKETS_RE, '');
  const v4 = parseIPv4(host);
  if (v4) {
    return isPublicV4(v4);
  }
  const v6 = parseIPv6(host);
  if (!v6) {
    return false;
  }
  // Everything in 0000::/8 — `::`, `::1`, IPv4-compatible and IPv4-mapped.
  if (v6.slice(0, 10).every((byte) => byte === 0)) {
    return v6[10] === 0xff && v6[11] === 0xff
      ? isPublicV4(v6.slice(12))
      : false;
  }
  return isPublicV6(v6);
}
