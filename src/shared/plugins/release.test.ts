import { describe, expect, it } from 'vitest';

import { GHOSTBOARD_VERSION } from './ids';
import type { PluginManifest } from './manifest';
import {
  isPluginReleaseError,
  PLUGIN_RELEASE_MAX_BYTES,
  PLUGIN_RELEASE_SCHEMA,
  parsePluginReleaseDocument,
  releaseMatchesManifest,
  selectCompatibleRelease,
} from './release';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function documentJson(overrides?: Record<string, unknown>): string {
  return JSON.stringify({
    schema: PLUGIN_RELEASE_SCHEMA,
    pluginId: 'community.example.title-tools',
    channel: 'stable',
    releases: [
      {
        version: '1.0.0',
        ghostboard: '>=1.0.0 <2.0.0',
        url: 'https://plugins.example.com/title-tools/1.0.0.zip',
        sha256: SHA_A,
        notes: 'normalize titles',
      },
    ],
    ...overrides,
  });
}

const MANIFEST: PluginManifest = {
  author: 'example',
  description: 'test',
  engines: { ghostboard: '>=1.0.0 <2.0.0' },
  id: 'community.example.title-tools',
  manifestVersion: 2,
  name: '标题整理',
  capabilities: [],
  entrypoints: { app: 'app.js' },
  version: '1.0.0',
};

describe('plugin release document', () => {
  it('parses a valid release document and selects the current ghostboard', () => {
    const parsed = parsePluginReleaseDocument(documentJson());
    expect(isPluginReleaseError(parsed)).toBe(false);
    if (isPluginReleaseError(parsed)) {
      return;
    }
    expect(parsed.pluginId).toBe('community.example.title-tools');
    expect(parsed.releases[0]?.sha256).toBe(SHA_A);
    const selected = selectCompatibleRelease(parsed);
    expect(isPluginReleaseError(selected)).toBe(false);
    if (isPluginReleaseError(selected)) {
      return;
    }
    expect(selected.version).toBe('1.0.0');
    expect(ghostboardMatches(selected.ghostboard)).toBe(true);
    expect(releaseMatchesManifest(parsed, MANIFEST, SHA_A)).toBeUndefined();
  });

  it('picks the newest compatible release', () => {
    const parsed = parsePluginReleaseDocument(
      documentJson({
        releases: [
          {
            version: '1.0.0',
            ghostboard: '>=1.0.0 <2.0.0',
            url: 'https://plugins.example.com/1.0.0.zip',
            sha256: SHA_A,
          },
          {
            version: '1.1.0',
            ghostboard: '>=1.0.0 <2.0.0',
            url: 'https://plugins.example.com/1.1.0.zip',
            sha256: SHA_B,
          },
          {
            version: '2.0.0',
            ghostboard: '>=2.0.0 <3.0.0',
            url: 'https://plugins.example.com/2.0.0.zip',
            sha256: 'c'.repeat(64),
          },
        ],
      })
    );
    expect(isPluginReleaseError(parsed)).toBe(false);
    if (isPluginReleaseError(parsed)) {
      return;
    }
    const selected = selectCompatibleRelease(parsed, GHOSTBOARD_VERSION);
    expect(isPluginReleaseError(selected)).toBe(false);
    if (!isPluginReleaseError(selected)) {
      expect(selected.version).toBe('1.1.0');
    }
  });

  it('rejects html, http urls, reserved ids, and oversized documents', () => {
    expect(parsePluginReleaseDocument('<html></html>')).toMatchObject({
      code: 'unsupported-source',
    });
    expect(
      parsePluginReleaseDocument(
        documentJson({
          releases: [
            {
              version: '1.0.0',
              ghostboard: '>=1.0.0 <2.0.0',
              url: 'http://plugins.example.com/plugin.zip',
              sha256: SHA_A,
            },
          ],
        })
      )
    ).toMatchObject({ code: 'invalid-release' });
    expect(
      parsePluginReleaseDocument(
        documentJson({ pluginId: 'ghostboard.builtin' })
      )
    ).toMatchObject({ code: 'invalid-release' });
    expect(
      parsePluginReleaseDocument('x'.repeat(PLUGIN_RELEASE_MAX_BYTES + 1))
    ).toMatchObject({ code: 'resource-limit' });
  });

  it('rejects a digest that does not match the release record', () => {
    const parsed = parsePluginReleaseDocument(documentJson());
    expect(isPluginReleaseError(parsed)).toBe(false);
    if (isPluginReleaseError(parsed)) {
      return;
    }
    expect(releaseMatchesManifest(parsed, MANIFEST, SHA_B)).toMatchObject({
      code: 'invalid-release',
    });
  });
});

function ghostboardMatches(range: string): boolean {
  return range === '>=1.0.0 <2.0.0';
}
