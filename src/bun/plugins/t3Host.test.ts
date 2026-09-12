import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginInstallPreview } from '../../shared/plugins/management';
import type { PluginManagementService } from './management';
import { T3HostController } from './t3Host';

vi.mock('../appPaths', () => ({
  getAppDataRoot: () => {
    throw new Error('Tests must specify an application data root');
  },
}));

const token = 't3-secret-token';
const cors = { 'Access-Control-Allow-Origin': '*' };
let directory: string;

const preview: PluginInstallPreview = {
  digest: 'a'.repeat(64),
  plugin: {
    capabilities: ['files'],
    ghostboard: '>=0.1.0',
    id: 't3.combined',
    name: 'T3 Combined',
    signatureStatus: 'unverified',
    version: '1.0.0',
  },
  source: { kind: 'file', label: 't3-combined.ghostboard-plugin' },
  transactionId: 'install-test',
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 't3-host-test-'));
  vi.stubEnv('GHOSTBOARD_PLUGIN_T3_PHASE', 'local');
  vi.stubEnv(
    'GHOSTBOARD_PLUGIN_T3_URL',
    'http://127.0.0.1:3210/t3-combined.ghostboard-plugin'
  );
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
    prepareFromFile: vi.fn(async () => preview),
    prepareFromUrl: vi.fn(async () => ({
      ...preview,
      source: {
        kind: 'url' as const,
        label: 'http://127.0.0.1/t3-combined.ghostboard-plugin',
      },
    })),
  } as unknown as PluginManagementService;
  return {
    host: new T3HostController(management, 'workspace', directory),
    management,
  };
}

async function request(host: T3HostController, route: string, body?: unknown) {
  return await host.handle(
    new Request(`http://127.0.0.1:54321/plugin-t3/${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    token,
    cors
  );
}

describe('T3HostController', () => {
  it('prepares local and explicitly loopback URL packages', async () => {
    const { host, management } = controller();
    expect(await (await request(host, 'prepare-file', {}))?.json()).toEqual(
      preview
    );
    expect(management.prepareFromFile).toHaveBeenCalledWith(
      join(directory, 't3-combined.ghostboard-plugin')
    );
    expect(
      await (await request(host, 'prepare-url', {}))?.json()
    ).toMatchObject({ source: { kind: 'url' } });
    expect(management.prepareFromUrl).toHaveBeenCalledWith(
      'http://127.0.0.1:3210/t3-combined.ghostboard-plugin',
      { allowLoopback: true }
    );
    host.dispose();
  });

  it('writes bounded selection fixtures and persists a redacted report', async () => {
    const { host } = controller();
    expect((await request(host, 'config'))?.status).toBe(200);
    await request(host, 'select', { scenario: 'valid' });
    expect(await readFile(join(directory, 'selected.csv'), 'utf8')).toContain(
      'First, quoted'
    );
    await request(host, 'record-operation', {
      ids: ['one', 'two'],
      operationId: 'plgimport_test',
    });
    expect(await (await request(host, 'config'))?.json()).toMatchObject({
      operation: { ids: ['one', 'two'], operationId: 'plgimport_test' },
      phase: 'local',
    });
    await request(host, 'report', { passed: true, leaked: token });
    const report = await readFile(join(directory, 'result-local.json'), 'utf8');
    expect(report).not.toContain(token);
    expect(report).toContain('<redacted>');
    host.dispose();
  });
});
