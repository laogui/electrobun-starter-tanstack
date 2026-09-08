import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import {
  isPluginManifestError,
  type PluginManifest,
  parsePluginManifest,
} from '../../shared/plugins/manifest';

const HOST_IMPORT_RE =
  /(?:from|import)\s*['"](?:@\/|electrobun|node:|fs|path|child_process)|(?:from|import)\s*['"][^'"]*src\/(?:mainview|bun|shared)/i;
const REQUIRE_HOST_RE =
  /require\s*\(\s*['"](?:@\/|electrobun|node:|fs|path|child_process|[^'"]*src\/(?:mainview|bun|shared))/i;

export interface LoadedPluginDirectory {
  directory: string;
  manifest: PluginManifest;
  sources: Record<string, string>;
}

export class PluginDirectoryError extends Error {
  code: 'not-found' | 'invalid-manifest' | 'host-import' | 'missing-handler';

  constructor(
    code: 'not-found' | 'invalid-manifest' | 'host-import' | 'missing-handler',
    message: string
  ) {
    super(message);
    this.name = 'PluginDirectoryError';
    this.code = code;
  }
}

export function assertNoHostImports(source: string, filename: string): void {
  if (HOST_IMPORT_RE.test(source) || REQUIRE_HOST_RE.test(source)) {
    throw new PluginDirectoryError(
      'host-import',
      `${filename} must not import GhostBoard, Node, or Electrobun modules`
    );
  }
}

export async function loadPluginDirectory(
  directory: string
): Promise<LoadedPluginDirectory> {
  const root = resolve(directory);
  const manifestPath = join(root, 'ghostboard.plugin.json');
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch {
    throw new PluginDirectoryError(
      'not-found',
      `missing ghostboard.plugin.json in ${root}`
    );
  }
  const manifest = parsePluginManifest(raw);
  if (isPluginManifestError(manifest)) {
    throw new PluginDirectoryError(
      'invalid-manifest',
      `${manifest.code}: ${manifest.message}`
    );
  }

  const sources: Record<string, string> = {};
  const handlerFiles = new Set(
    [
      ...manifest.contributes.commands.map(
        (command) => command.handler.split('#')[0] ?? ''
      ),
      ...manifest.contributes.importers.map(
        (importer) => importer.handler.split('#')[0] ?? ''
      ),
      ...manifest.contributes.panels.map((panel) => panel.entry),
      ...manifest.contributes.canvasTypes.map((canvasType) => canvasType.entry),
    ].filter(Boolean)
  );
  for (const relative of handlerFiles) {
    const segments = relative?.split('/') ?? [];
    if (
      !relative ||
      isAbsolute(relative) ||
      relative.includes('\\') ||
      relative.includes('\u0000') ||
      segments.some(
        (segment) => segment.length === 0 || segment === '.' || segment === '..'
      )
    ) {
      throw new PluginDirectoryError(
        'missing-handler',
        `handler path is not inside the plugin directory: ${relative}`
      );
    }
    const filename = join(root, relative);
    let source: string;
    try {
      source = await readFile(filename, 'utf8');
    } catch {
      throw new PluginDirectoryError(
        'missing-handler',
        `missing handler file: ${relative}`
      );
    }
    assertNoHostImports(source, relative);
    sources[relative] = source;
  }

  return { directory: root, manifest, sources };
}
