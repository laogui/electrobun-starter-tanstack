import { realpathSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from 'node:path';

/** Normalize a workspace-relative path from a manifest to `/` separators. */
export function normalizeManifestPath(filePath: string): string {
  return normalize(filePath).replaceAll('\\', '/');
}

function escapesRoot(rel: string): boolean {
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * realpath of `path`, resolving symlinks in the deepest ancestor that exists
 * and re-appending the not-yet-created tail. Lets write targets be checked
 * before the file exists.
 */
function realpathOfNearestExisting(path: string): string {
  const tail: string[] = [];
  let current = path;
  for (;;) {
    try {
      return join(realpathSync(current), ...tail.toReversed());
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        return path;
      }
      tail.push(basename(current));
      current = parent;
    }
  }
}

/**
 * Resolve `candidate` against `root` and require the result to stay strictly
 * inside it, both lexically and after following symlinks, so a link planted
 * in a shared workspace cannot redirect a read/write outside `root`.
 * Returns the lexical absolute path. Throws `message` on escape.
 */
export function assertInside(
  root: string,
  candidate: string,
  message = 'Path escapes its root directory.'
): string {
  const absoluteRoot = resolve(root);
  const fullPath = resolve(absoluteRoot, candidate);
  const lexical = relative(absoluteRoot, fullPath);
  if (!lexical || escapesRoot(lexical)) {
    throw new Error(message);
  }
  const real = relative(
    realpathOfNearestExisting(absoluteRoot),
    realpathOfNearestExisting(fullPath)
  );
  if (!real || escapesRoot(real)) {
    throw new Error(message);
  }
  return fullPath;
}

export interface WorkspaceSubpathRule {
  /** Workspace-relative directory the path must live under, e.g. `content`. */
  dir: string;
  /** Required file extension including the dot, e.g. `.md`. */
  extension?: string;
  /** Human label for error messages, e.g. `Note`. */
  label: string;
}

/**
 * Validate an untrusted workspace-relative path (from a manifest or RPC):
 * non-empty, relative, normalized, under `rule.dir/`, no `..` segments, the
 * right extension, and (via `assertInside`) not escaping through symlinks.
 */
export function resolveWorkspaceSubpath(
  wsPath: string,
  filePath: string,
  rule: WorkspaceSubpathRule
): { fullPath: string; relativePath: string } {
  if (!filePath.trim()) {
    throw new Error(`${rule.label} path is required.`);
  }
  if (isAbsolute(filePath)) {
    throw new Error(`${rule.label} path must be relative.`);
  }
  const inside = `${rule.label} path must stay inside ${rule.dir}/.`;
  const relativePath = normalizeManifestPath(filePath);
  if (
    !relativePath.startsWith(`${rule.dir}/`) ||
    relativePath.split('/').includes('..') ||
    (rule.extension !== undefined && !relativePath.endsWith(rule.extension))
  ) {
    throw new Error(inside);
  }
  const fullPath = assertInside(
    resolve(wsPath, rule.dir),
    relativePath.slice(rule.dir.length + 1),
    inside
  );
  return { fullPath, relativePath };
}
