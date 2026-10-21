import { lookup } from 'node:dns/promises';

import { isIpLiteral, isPublicAddress } from './outboundPolicy';

const BRACKETS_RE = /^\[|\]$/g;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const LOCAL_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'broadcasthost',
  'ip6-localhost',
  'ip6-loopback',
]);

export class OutboundTargetError extends Error {
  /** `unresolved`: DNS failed or returned nothing. `forbidden`: non-public. */
  code: 'forbidden' | 'unresolved';
  hostname: string;

  constructor(
    code: OutboundTargetError['code'],
    hostname: string,
    message: string
  ) {
    super(message);
    this.name = 'OutboundTargetError';
    this.code = code;
    this.hostname = hostname;
  }
}

/** Strip IPv6 brackets and lowercase. */
export function bareHostname(hostname: string): string {
  return hostname.toLowerCase().replace(BRACKETS_RE, '');
}

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(bareHostname(hostname));
}

/**
 * Cheap syntactic refusal before any DNS work: localhost-style names,
 * mDNS `.local`, and IP literals that are not publicly routable.
 */
export function isObviouslyNonPublicHost(hostname: string): boolean {
  const host = bareHostname(hostname);
  if (!host || LOCAL_HOSTNAMES.has(host)) {
    return true;
  }
  if (host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }
  return isIpLiteral(host) && !isPublicAddress(host);
}

export interface PublicTargetOptions {
  /** Let loopback hosts through (dev/test harnesses only). */
  allowLoopback?: boolean;
}

/**
 * Rejects a hop whose hostname resolves to anything non-public. Every address
 * the name resolves to must be public, so a record set that mixes a public
 * and a private address is refused. Call it for EVERY hop of a redirect
 * chain and fetch with `redirect: 'manual'`.
 *
 * There is a TOCTOU window between this lookup and the socket connect: Bun's
 * `fetch` has no `lookup` hook, and dialing the resolved IP directly would
 * break SNI and certificate validation. We accept the window rather than
 * weaken TLS.
 */
export async function assertPublicTarget(
  url: URL,
  options: PublicTargetOptions = {}
): Promise<void> {
  if (options.allowLoopback && isLoopbackHost(url.hostname)) {
    return;
  }
  const hostname = url.hostname.replace(BRACKETS_RE, '');
  if (isObviouslyNonPublicHost(hostname)) {
    throw new OutboundTargetError(
      'forbidden',
      hostname,
      `host is not publicly routable: ${hostname}`
    );
  }
  let addresses: string[];
  if (isIpLiteral(hostname)) {
    addresses = [hostname];
  } else {
    try {
      addresses = (await lookup(hostname, { all: true })).map(
        (entry) => entry.address
      );
    } catch {
      throw new OutboundTargetError(
        'unresolved',
        hostname,
        `host could not be resolved: ${hostname}`
      );
    }
  }
  if (addresses.length === 0) {
    throw new OutboundTargetError(
      'unresolved',
      hostname,
      `host could not be resolved: ${hostname}`
    );
  }
  for (const address of addresses) {
    if (!isPublicAddress(address)) {
      throw new OutboundTargetError(
        'forbidden',
        hostname,
        `host resolves to a non-public address: ${address}`
      );
    }
  }
}
