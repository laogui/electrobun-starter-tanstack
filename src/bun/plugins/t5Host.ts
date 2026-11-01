import { appendFile, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite } from '../atomicWrite';
import {
  PluginHostController,
  type PluginHostControllerOptions,
} from './hostController';
import type { PluginManagementService } from './management';
import { probeEnv } from './probeGate';

export type T5Phase = 'install' | 'picker' | 'restart';
export type T5PickerMode = 'manual' | 'scripted';

/** Public example inventory written by scripts/trusted-plugin-t5/run.ts. */
export interface T5ExampleSpec {
  id: string;
  installSha256: string;
  installUrl: string;
  installVersion: string;
  releasesUrl: string;
  updateVersion?: string;
}

export interface T5Examples {
  baseUrl: string;
  examples: T5ExampleSpec[];
  hostRange: string;
  publicKey: string;
}

const EXAMPLES_FILE = 'examples.json';
const SELECTED_FILE = 'selected.csv';
const PICKER_LOG = 'picker-log.jsonl';

export function t5Phase(
  env: Record<string, string | undefined> = probeEnv()
): T5Phase | null {
  const phase = env.GHOSTBOARD_PLUGIN_T5_PHASE;
  return phase === 'install' || phase === 'picker' || phase === 'restart'
    ? phase
    : null;
}

export function t5PickerMode(
  env: Record<string, string | undefined> = probeEnv()
): T5PickerMode {
  return env.GHOSTBOARD_PLUGIN_T5_PICKER === 'manual' ? 'manual' : 'scripted';
}

function jsonBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function isExampleSpec(value: unknown): value is T5ExampleSpec {
  const record = jsonBody(value);
  return (
    typeof record.id === 'string' &&
    typeof record.installSha256 === 'string' &&
    typeof record.installUrl === 'string' &&
    typeof record.installVersion === 'string' &&
    typeof record.releasesUrl === 'string' &&
    (record.updateVersion === undefined ||
      typeof record.updateVersion === 'string')
  );
}

export function parseT5Examples(raw: string): T5Examples {
  const record = jsonBody(JSON.parse(raw));
  if (
    typeof record.baseUrl !== 'string' ||
    !record.baseUrl.startsWith('https://') ||
    typeof record.hostRange !== 'string' ||
    typeof record.publicKey !== 'string' ||
    !Array.isArray(record.examples) ||
    record.examples.length === 0 ||
    !record.examples.every(isExampleSpec)
  ) {
    throw new Error('T5 examples inventory is invalid');
  }
  for (const example of record.examples) {
    if (
      !(
        example.installUrl.startsWith(`${record.baseUrl}/`) &&
        example.releasesUrl.startsWith(`${record.baseUrl}/`)
      )
    ) {
      throw new Error(
        `T5 example ${example.id} is not under ${record.baseUrl}`
      );
    }
  }
  return {
    baseUrl: record.baseUrl,
    examples: record.examples,
    hostRange: record.hostRange,
    publicKey: record.publicKey,
  };
}

/**
 * Evidence-only host routes for the T5 public-distribution probe. Unlike the
 * T3 / T4 controllers this never passes `allowLoopback`: every install and
 * update goes through the same public-HTTPS path the production renderer RPC
 * uses, so the probe proves the published examples, not a test server.
 */
export class T5HostController extends PluginHostController {
  private readonly directory: string;
  private readonly management: PluginManagementService;

  constructor(
    management: PluginManagementService,
    workspaceId: string,
    directory: string,
    options: PluginHostControllerOptions = {}
  ) {
    super(management, workspaceId, options);
    this.management = management;
    this.directory = directory;
  }

  private async examples(): Promise<T5Examples> {
    return parseT5Examples(
      await readFile(join(this.directory, EXAMPLES_FILE), 'utf8')
    );
  }

  override async handle(
    request: Request,
    token: string,
    cors: HeadersInit
  ): Promise<Response | null> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/plugin-t5/')) {
      return super.handle(request, token, cors);
    }
    const headers = new Headers(cors);
    headers.set('Cache-Control', 'no-store');
    const phase = t5Phase();
    if (!phase) {
      return new Response('Invalid test phase', { status: 400, headers });
    }
    try {
      if (request.method === 'GET' && url.pathname.endsWith('/config')) {
        return Response.json(
          { ...(await this.examples()), phase, picker: t5PickerMode() },
          { headers }
        );
      }
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers });
      }
      const body = jsonBody(await request.json().catch(() => ({})));
      if (url.pathname.endsWith('/prepare-url')) {
        const { examples } = await this.examples();
        const example = examples.find((item) => item.id === body.pluginId);
        if (!example) {
          throw new Error('Unknown T5 example');
        }
        return Response.json(
          await this.management.prepareFromUrl(example.installUrl),
          { headers }
        );
      }
      if (url.pathname.endsWith('/prepare-update')) {
        if (
          typeof body.pluginId !== 'string' ||
          typeof body.digest !== 'string'
        ) {
          throw new Error('Missing current plugin identity');
        }
        return Response.json(
          await this.management.prepareUpdate({
            digest: body.digest,
            pluginId: body.pluginId,
          }),
          { headers }
        );
      }
      if (url.pathname.endsWith('/select')) {
        if (t5PickerMode() === 'manual') {
          throw new Error(
            'Scripted selection is disabled for the manual picker'
          );
        }
        const path = join(this.directory, SELECTED_FILE);
        if (body.scenario === 'cancel') {
          await rm(path, { force: true });
        } else if (body.scenario === 'valid') {
          await writeFile(
            path,
            'title,text,color\nPublic example,Installed from public HTTPS,blue\nSecond note,Signed and verified,\n'
          );
        } else {
          throw new Error('Unknown T5 selection scenario');
        }
        return Response.json({ selected: body.scenario }, { headers });
      }
      if (url.pathname.endsWith('/picker-note')) {
        if (typeof body.message !== 'string') {
          throw new Error('Expected a picker note');
        }
        await appendFile(
          join(this.directory, PICKER_LOG),
          `${JSON.stringify({ at: new Date().toISOString(), message: body.message, step: body.step ?? null })}\n`
        );
        return Response.json({ noted: true }, { headers });
      }
      if (url.pathname.endsWith('/report')) {
        if (Object.keys(body).length === 0) {
          throw new Error('Expected JSON report');
        }
        await atomicWrite(
          join(this.directory, `result-${phase}.json`),
          `${JSON.stringify(
            {
              ...body,
              phase,
              picker: t5PickerMode(),
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
          error: error instanceof Error ? error.message : 'T5 probe failed',
        },
        { status: 400, headers }
      );
    }
  }
}
