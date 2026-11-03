import { createHash } from 'node:crypto';

/** Locale-independent order of complete slash-separated archive paths. */
export function comparePluginPaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Shared by the public packer and host; never hash filesystem DFS order. */
export function canonicalTreeDigest(files) {
  const hash = createHash('sha256');
  for (const [path, bytes] of [...files].sort(([a], [b]) =>
    comparePluginPaths(a, b)
  )) {
    hash.update(JSON.stringify([path, bytes.byteLength]));
    hash.update(bytes);
  }
  return hash.digest('hex');
}
