import { describe, expect, it } from 'vitest';

import {
  isPluginManifestError,
  listContributionKinds,
  parsePluginManifest,
} from './manifest';

const TITLE_TOOLS_MANIFEST = {
  manifestVersion: 1,
  id: 'community.alice.title-tools',
  name: '标题整理',
  version: '1.0.0',
  engines: { hostApi: '>=1.0.0 <2.0.0' },
  permissions: {
    required: [
      { id: 'content.selection.read', reason: '读取选中资料的标题' },
      { id: 'content.selection.write', reason: '整理选中资料的标题' },
    ],
  },
  contributes: {
    commands: [
      {
        id: 'normalize-titles',
        name: '整理选中资料标题',
        handler: 'main.js#normalizeTitles',
        when: 'selection.hasContent',
      },
    ],
  },
};

describe('parsePluginManifest', () => {
  it.each([
    ['>=1.0.0 <2.0.0', true],
    ['>=0.9.0 <1.0.1', true],
    ['>=1.0.1 <2.0.0', false],
    ['>=1.99.0 <2.0.0', false],
    ['>=0.9.0 <1.0.0', false],
    ['>=2.0.0 <3.0.0', false],
    ['>=1.0.0 <1.0.0', false],
    ['>=01.0.0 <2.0.0', false],
    ['^1.0.0', false],
  ])('checks the actual host version against %s', (hostApi, compatible) => {
    const result = parsePluginManifest({
      ...TITLE_TOOLS_MANIFEST,
      engines: { hostApi },
    });
    expect(isPluginManifestError(result)).toBe(!compatible);
    if (!compatible) {
      expect(result).toMatchObject({ code: 'incompatible-host-api' });
    }
  });

  it('rejects unknown required permissions and retains unknown optional declarations without granting them', () => {
    const unknown = [{ id: 'future.magic', reason: 'A future capability' }];
    expect(
      parsePluginManifest({
        ...TITLE_TOOLS_MANIFEST,
        permissions: { required: unknown },
      })
    ).toMatchObject({ code: 'invalid-manifest' });
    expect(
      parsePluginManifest({
        ...TITLE_TOOLS_MANIFEST,
        permissions: { optional: unknown },
      })
    ).toMatchObject({ permissions: { optional: unknown } });
  });

  it.each([
    'events',
    'menus',
    'settings',
  ])('rejects unsupported %s alongside supported contributions', (kind) => {
    expect(
      parsePluginManifest({
        ...TITLE_TOOLS_MANIFEST,
        contributes: { ...TITLE_TOOLS_MANIFEST.contributes, [kind]: [] },
      })
    ).toMatchObject({ code: 'invalid-manifest' });
  });

  it('rejects ambiguous view aliases instead of dropping contributions', () => {
    expect(
      parsePluginManifest({
        ...TITLE_TOOLS_MANIFEST,
        contributes: {
          ...TITLE_TOOLS_MANIFEST.contributes,
          views: [],
          panels: [{ id: 'p', name: 'Panel', entry: 'panel.html' }],
        },
      })
    ).toMatchObject({ code: 'invalid-manifest' });
  });

  it('rejects malformed permission blocks and unsafe canvas entries', () => {
    expect(
      parsePluginManifest({
        ...TITLE_TOOLS_MANIFEST,
        permissions: 'content.selection.read',
      })
    ).toMatchObject({
      code: 'invalid-manifest',
      message: 'permissions must be an object',
    });
    expect(
      parsePluginManifest({
        ...TITLE_TOOLS_MANIFEST,
        contributes: {
          canvasTypes: [
            {
              id: 'counter',
              name: 'Counter',
              dataVersion: 1,
              entry: '../counter.html',
            },
          ],
        },
      })
    ).toMatchObject({
      code: 'invalid-manifest',
      message: 'invalid canvas type entry: ../counter.html',
    });
    expect(parsePluginManifest('null')).toMatchObject({
      code: 'invalid-manifest',
      message: 'manifest must be an object',
    });
  });

  it('parses a command-only title-tools manifest without HTML or instance ids', () => {
    const parsed = parsePluginManifest(TITLE_TOOLS_MANIFEST);
    expect(isPluginManifestError(parsed)).toBe(false);
    if (isPluginManifestError(parsed)) {
      return;
    }
    expect(listContributionKinds(parsed)).toEqual(['command']);
    expect(parsed.contributes.commands).toHaveLength(1);
    expect(parsed.contributes.panels).toEqual([]);
    expect(parsed.contributes.canvasTypes).toEqual([]);
    expect(parsed.contributes.importers).toEqual([]);
  });

  it('accepts the four contribution kinds and rejects unknown kinds', () => {
    const parsed = parsePluginManifest({
      ...TITLE_TOOLS_MANIFEST,
      contributes: {
        commands: TITLE_TOOLS_MANIFEST.contributes.commands,
        views: [{ id: 'probe', name: 'Probe', entry: 'panel.html' }],
        importers: [
          {
            id: 'csv',
            name: 'CSV',
            handler: 'import.js#parseCsv',
          },
        ],
        canvasTypes: [{ id: 'counter', name: 'Counter', dataVersion: 1 }],
      },
    });
    expect(isPluginManifestError(parsed)).toBe(false);
    if (isPluginManifestError(parsed)) {
      return;
    }
    expect(listContributionKinds(parsed)).toEqual([
      'command',
      'panel',
      'importer',
      'canvasType',
    ]);

    const unknown = parsePluginManifest({
      ...TITLE_TOOLS_MANIFEST,
      contributes: { widgets: [{ id: 'x' }] },
    });
    expect(unknown).toMatchObject({
      code: 'invalid-manifest',
      message: 'unknown contribution kind: widgets',
    });
  });

  it('rejects reserved builtin ids, empty contributions, and bad handlers', () => {
    expect(
      parsePluginManifest({
        ...TITLE_TOOLS_MANIFEST,
        id: 'ghostboard.demo',
      })
    ).toMatchObject({ code: 'reserved-plugin-id' });
    expect(
      parsePluginManifest({
        ...TITLE_TOOLS_MANIFEST,
        contributes: { commands: [] },
      })
    ).toMatchObject({ code: 'missing-contribution' });
    expect(
      parsePluginManifest({
        ...TITLE_TOOLS_MANIFEST,
        contributes: {
          commands: [
            {
              id: 'normalize-titles',
              name: '整理选中资料标题',
              handler: 'eval("boom")',
            },
          ],
        },
      })
    ).toMatchObject({ code: 'invalid-manifest' });
  });
});
