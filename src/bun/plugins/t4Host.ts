import { rm } from 'node:fs/promises';
import { atomicWrite } from '../atomicWrite';
import {
  createExtensionInstance,
  loadExtensionInstance,
  updateExtensionInstance,
} from '../extensions/instanceStore';
import {
  PluginHostController,
  type PluginHostControllerOptions,
} from './hostController';
import type { PluginManagementService } from './management';

type T4Phase = 'migration' | 'safe-mode' | 'safe-recovery' | 'update';

const PACKAGE_ARCHIVES = {
  keyChange: 't4-key-change.ghostboard-plugin',
  v1: 't4-v1.ghostboard-plugin',
  v11: 't4-v1.1.ghostboard-plugin',
  v12: 't4-v1.2.ghostboard-plugin',
} as const;

type T4PackageName = keyof typeof PACKAGE_ARCHIVES;

const INSTANCE_ID = 'extinst_t4migration';
const PLUGIN_ID = 'community.example.t4';
const CANVAS_TYPE_ID = `${PLUGIN_ID}/counter`;
const BAD_DESCRIPTOR_MARKER = 't4-bad-descriptor';

function testPhase(): T4Phase | null {
  const phase = process.env.GHOSTBOARD_PLUGIN_T4_PHASE;
  return phase === 'migration' ||
    phase === 'safe-mode' ||
    phase === 'safe-recovery' ||
    phase === 'update'
    ? phase
    : null;
}

async function requestedPackage(request: Request): Promise<T4PackageName> {
  const body = (await request.json().catch(() => ({}))) as {
    package?: unknown;
  };
  const name = body.package ?? 'v1';
  if (typeof name !== 'string' || !(name in PACKAGE_ARCHIVES)) {
    throw new Error('Unknown T4 package');
  }
  return name as T4PackageName;
}

function jsonBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export class T4HostController extends PluginHostController {
  private readonly directory: string;
  private readonly management: PluginManagementService;
  private readonly workspacePath: string;

  constructor(
    management: PluginManagementService,
    workspaceId: string,
    directory: string,
    workspacePath: string,
    options: PluginHostControllerOptions = {}
  ) {
    super(management, workspaceId, options);
    this.management = management;
    this.directory = directory;
    this.workspacePath = workspacePath;
  }

  override async handle(
    request: Request,
    token: string,
    cors: HeadersInit
  ): Promise<Response | null> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/plugin-t4/')) {
      return super.handle(request, token, cors);
    }
    const headers = new Headers(cors);
    headers.set('Cache-Control', 'no-store');
    const phase = testPhase();
    if (!phase) {
      return new Response('Invalid test phase', { status: 400, headers });
    }
    try {
      if (request.method === 'GET' && url.pathname.endsWith('/config')) {
        return Response.json({ phase }, { headers });
      }
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers });
      }
      if (url.pathname.endsWith('/prepare-file')) {
        const packageName = await requestedPackage(request);
        return Response.json(
          await this.management.prepareFromFile(
            `${this.directory}/${PACKAGE_ARCHIVES[packageName]}`
          ),
          { headers }
        );
      }
      if (url.pathname.endsWith('/prepare-update')) {
        const body = jsonBody(await request.json().catch(() => ({})));
        if (
          typeof body.pluginId !== 'string' ||
          typeof body.digest !== 'string'
        ) {
          throw new Error('Missing current plugin identity');
        }
        return Response.json(
          await this.management.prepareUpdate(
            {
              digest: body.digest,
              pluginId: body.pluginId,
            },
            { allowLoopback: true }
          ),
          { headers }
        );
      }
      if (url.pathname.endsWith('/descriptor-mode')) {
        const body = jsonBody(await request.json().catch(() => ({})));
        if (body.mode === 'bad') {
          await atomicWrite(
            `${this.directory}/${BAD_DESCRIPTOR_MARKER}`,
            'bad\n'
          );
        } else if (body.mode === 'normal') {
          await rm(`${this.directory}/${BAD_DESCRIPTOR_MARKER}`, {
            force: true,
          });
        } else {
          throw new Error('Unknown descriptor mode');
        }
        return Response.json({ mode: body.mode }, { headers });
      }
      if (url.pathname.endsWith('/migration')) {
        const body = jsonBody(await request.json().catch(() => ({})));
        const action = body.action;
        if (action === 'seed') {
          const record = await createExtensionInstance(this.workspacePath, {
            appVersion: '1.0.0',
            canvasTypeId: CANVAS_TYPE_ID,
            dataVersion: 1,
            id: INSTANCE_ID,
            presentation: { title: 'Before migration' },
            state: { count: 1 },
          });
          return Response.json({ record }, { headers });
        }
        if (action === 'upgrade') {
          const current = await loadExtensionInstance(
            this.workspacePath,
            INSTANCE_ID
          );
          if ('error' in current) {
            throw new Error('Migration instance is missing');
          }
          const updated = await updateExtensionInstance(this.workspacePath, {
            appVersion: '1.1.0',
            dataVersion: 2,
            expectedRevision: current.record.revision,
            instanceId: INSTANCE_ID,
            presentation: { title: 'After migration' },
            state: { count: 2 },
          });
          if ('error' in updated) {
            throw new Error('Migration instance could not be upgraded');
          }
          return Response.json({ record: updated.record }, { headers });
        }
        if (action === 'failed-upgrade') {
          const current = await loadExtensionInstance(
            this.workspacePath,
            INSTANCE_ID
          );
          if ('error' in current) {
            throw new Error('Migration instance is missing');
          }
          let error = '';
          try {
            await updateExtensionInstance(this.workspacePath, {
              appVersion: '1.1.0',
              dataVersion: 2,
              expectedRevision: current.record.revision + 1,
              instanceId: INSTANCE_ID,
              presentation: { title: 'Failed migration' },
              state: { count: 99 },
            });
          } catch (failure) {
            error =
              failure instanceof Error ? failure.message : String(failure);
          }
          const after = await loadExtensionInstance(
            this.workspacePath,
            INSTANCE_ID
          );
          return Response.json(
            { error, record: 'error' in after ? undefined : after.record },
            { headers }
          );
        }
        if (action === 'read') {
          return Response.json(
            await loadExtensionInstance(this.workspacePath, INSTANCE_ID),
            { headers }
          );
        }
        throw new Error('Unknown migration action');
      }
      if (url.pathname.endsWith('/report')) {
        const body = await request.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new Error('Expected JSON report');
        }
        await atomicWrite(
          `${this.directory}/result-${phase}.json`,
          `${JSON.stringify(
            {
              ...body,
              phase,
              host: {
                arch: process.arch,
                bun: Bun.version,
                platform: process.platform,
              },
            },
            null,
            2
          ).replaceAll(token, '<redacted>')}\n`
        );
        return Response.json({ saved: true }, { headers });
      }
      return new Response('Not found', { status: 404, headers });
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : 'T4 probe failed',
        },
        { status: 400, headers }
      );
    }
  }
}
