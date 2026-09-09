import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  hostVersionRangeIncludes,
  LEGACY_PLUGIN_MESSAGE,
  parsePluginManifest,
} from './manifest';

const manifest = {
  manifestVersion: 2,
  id: 'example.hello',
  name: 'Hello',
  version: '1.0.0',
  engines: { ghostboard: '>=1.0.0 <2.0.0' },
  entrypoints: { app: 'app.js' },
};

describe('manifest v2', () => {
  it('accepts a minimal app without static contributions or permissions', () => {
    expect(parsePluginManifest(JSON.stringify(manifest))).toEqual({
      ...manifest,
      capabilities: [],
    });
  });

  it('preserves author claims and update metadata without claiming verification', () => {
    const input = {
      ...manifest,
      capabilities: ['network', 'files', 'clipboard'],
      publicKey: 'author-claim',
      update: { url: 'https://example.com/latest.json' },
      author: 'Example',
    };
    expect(parsePluginManifest(input)).toEqual(input);
  });

  it('rejects v1 rather than silently granting high trust', () => {
    expect(parsePluginManifest({ ...manifest, manifestVersion: 1 })).toEqual({
      code: 'legacy-contract',
      message: LEGACY_PLUGIN_MESSAGE,
    });
  });

  it.each([
    'permissions',
    'contributes',
    'backend',
  ])('rejects old or unsupported field %s', (field) => {
    expect(parsePluginManifest({ ...manifest, [field]: {} })).toMatchObject({
      code: 'invalid-manifest',
    });
  });

  it.each([
    '../app.js',
    '/app.js',
    'a/../../app.js',
    'a\\app.js',
    'a//app.js',
    './app.js',
    'app.html',
    'https://host/app.js',
    'app.js\0',
  ])('rejects unsafe app entry %s', (app) => {
    expect(
      parsePluginManifest({ ...manifest, entrypoints: { app } })
    ).toMatchObject({ code: 'invalid-manifest' });
  });

  it('requires a frontend entry and refuses a backend entry', () => {
    expect(parsePluginManifest({ ...manifest, entrypoints: {} })).toMatchObject(
      { code: 'invalid-manifest' }
    );
    expect(
      parsePluginManifest({
        ...manifest,
        entrypoints: { app: 'app.js', bun: 'backend.js' },
      })
    ).toMatchObject({ code: 'invalid-manifest' });
  });

  it('validates capabilities as display metadata', () => {
    for (const capabilities of [
      ['network', 'network'],
      ['content.selection.read'],
      'files',
    ]) {
      expect(parsePluginManifest({ ...manifest, capabilities })).toMatchObject({
        code: 'invalid-manifest',
      });
    }
  });

  it('enforces host compatibility and reserved ids', () => {
    expect(
      parsePluginManifest({
        ...manifest,
        engines: { ghostboard: '>=2.0.0 <3.0.0' },
      })
    ).toMatchObject({ code: 'incompatible-host-api' });
    expect(
      parsePluginManifest({
        ...manifest,
        engines: { hostApi: '>=1.0.0 <2.0.0' },
      })
    ).toMatchObject({ code: 'invalid-manifest' });
    expect(
      parsePluginManifest({ ...manifest, id: 'ghostboard.example' })
    ).toMatchObject({ code: 'reserved-plugin-id' });
    expect(parsePluginManifest('{')).toMatchObject({ code: 'invalid-json' });
  });

  it.each([
    'http://example.com/update',
    'https://user:pass@example.com/update',
    'not-a-url',
  ])('rejects invalid update metadata %s', (url) => {
    expect(parsePluginManifest({ ...manifest, update: { url } })).toMatchObject(
      { code: 'invalid-manifest' }
    );
  });

  it('compares release versions with prereleases correctly', () => {
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.10')).toBeLessThan(0);
    expect(compareSemver('1.0.0-beta', '1.0.0')).toBeLessThan(0);
    expect(hostVersionRangeIncludes('>=1.0.0 <2.0.0', '1.0.0')).toBe(true);
    expect(hostVersionRangeIncludes('>=1.0.0 <2.0.0', '2.0.0')).toBe(false);
    expect(hostVersionRangeIncludes('>=1.0.0 <2.0.0', '1.0.0-beta')).toBe(
      false
    );
  });
});
