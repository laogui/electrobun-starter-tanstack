import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginInstallPreview } from '../../shared/plugins/management';
import type { PluginManagementService } from './management';
import { parseT5Examples, T5HostController } from './t5Host';

vi.mock('../appPaths', () => ({
  getAppDataRoot: () => {
    throw new Error('Tests must specify an application data root');
  },
}));

const token = 't5-secret-token';
const cors = { 'Access-Control-Allow-Origin': '*' };
const baseUrl = 'https://dl.example.test/plugins/examples';
let directory: string;

const examples = {
  baseUrl,
  examples: [
    {
      id: 'example.hello',
      installSha256: 'b'.repeat(64),
      installUrl: `${baseUrl}/example.hello/0.1.0/example.hello-0.1.0.ghostboard-plugin`,
      installVersion: '0.1.0',
      releasesUrl: `${baseUrl}/example.hello/releases.json`,
      updateVersion: '0.1.1',
    },
  ],
  hostRange: '>=1.0.0 <2.0.0',
  publicKey: 'ed25519-spki:AAAA',
};

const preview: PluginInstallPreview = {
  digest: 'a'.repeat(64),
  plugin: {
    capabilities: [],
    ghostboard: '>=1.0.0 <2.0.0',
    id: 'example.hello',
    name: 'Hello GhostBoard',
    signatureStatus: 'verified',
    version: '0.1.0',
  },
  source: { kind: 'url', label: examples.examples[0]!.installUrl },
  transactionId: 'install-test',
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 't5-host-test-'));
  await writeFile(join(directory, 'examples.json'), JSON.stringify(examples));
  vi.stubEnv('GHOSTBOARD_PLUGIN_T5_PHASE', 'install');
  vi.stubGlobal('Bun', {
    file: (path: string) => ({
      exists: async () => {
        try {
          await readFile(path);
          return true;
        } catch {
          return false;
        }
      },
      json: async () => JSON.parse(await readFile(path, 'utf8')) as unknown,
    }),
    version: 'test-bun',
    write: (path: string, data: string) => writeFile(path, data),
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(directory, { force: true, recursive: true });
});

function controller() {
  const management = {
    prepareFromUrl: vi.fn(async () => preview),
    prepareUpdate: vi.fn(async () => ({
      ...preview,
      currentVersion: '0.1.0',
      plugin: { ...preview.plugin, version: '0.1.1' },
    })),
  } as unknown as PluginManagementService;
  return {
    host: new T5HostController(management, 'workspace', directory),
    management,
  };
}

async function request(host: T5HostController, route: string, body?: unknown) {
  return await host.handle(
    new Request(`http://127.0.0.1:54321/plugin-t5/${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    token,
    cors
  );
}

describe('parseT5Examples', () => {
  it('rejects inventories that are not public HTTPS or leave the base URL', () => {
    expect(() =>
      parseT5Examples(JSON.stringify({ ...examples, baseUrl: 'http://x' }))
    ).toThrow('invalid');
    expect(() =>
      parseT5Examples(
        JSON.stringify({
          ...examples,
          examples: [
            {
              ...examples.examples[0],
              installUrl: 'https://elsewhere.test/pkg.ghostboard-plugin',
            },
          ],
        })
      )
    ).toThrow('not under');
    expect(parseT5Examples(JSON.stringify(examples))).toEqual(examples);
  });
});

describe('T5HostController', () => {
  it('installs and updates through the public path without allowLoopback', async () => {
    const { host, management } = controller();
    expect(await (await request(host, 'config'))?.json()).toMatchObject({
      baseUrl,
      phase: 'install',
      picker: 'scripted',
    });
    expect(
      await (
        await request(host, 'prepare-url', { pluginId: 'example.hello' })
      )?.json()
    ).toEqual(preview);
    expect(management.prepareFromUrl).toHaveBeenCalledWith(
      examples.examples[0]!.installUrl
    );
    expect(
      (await request(host, 'prepare-url', { pluginId: 'example.other' }))
        ?.status
    ).toBe(400);
    await request(host, 'prepare-update', {
      digest: preview.digest,
      pluginId: 'example.hello',
    });
    expect(management.prepareUpdate).toHaveBeenCalledWith({
      digest: preview.digest,
      pluginId: 'example.hello',
    });
    expect((await request(host, 'prepare-update', {}))?.status).toBe(400);
    host.dispose();
  });

  it('scripts the picker unless manual, records picker notes and redacts reports', async () => {
    const { host } = controller();
    await request(host, 'select', { scenario: 'valid' });
    expect(await readFile(join(directory, 'selected.csv'), 'utf8')).toContain(
      'Public example'
    );
    await request(host, 'select', { scenario: 'cancel' });
    await expect(readFile(join(directory, 'selected.csv'))).rejects.toThrow();
    vi.stubEnv('GHOSTBOARD_PLUGIN_T5_PICKER', 'manual');
    expect((await request(host, 'select', { scenario: 'valid' }))?.status).toBe(
      400
    );
    await request(host, 'picker-note', {
      message: 'Choose the sample file',
      step: 'select',
    });
    expect(
      await readFile(join(directory, 'picker-log.jsonl'), 'utf8')
    ).toContain('"step":"select"');
    await request(host, 'report', { leaked: token, passed: true });
    const report = await readFile(
      join(directory, 'result-install.json'),
      'utf8'
    );
    expect(report).not.toContain(token);
    expect(report).toContain('"picker": "manual"');
    host.dispose();
  });
});
