import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite } from '../atomicWrite';
import { PluginHostController } from './hostController';
import type { PluginManagementService } from './management';

type T3Phase = 'download' | 'local' | 'restart';

function testPhase(): T3Phase | null {
  const phase = process.env.GHOSTBOARD_PLUGIN_T3_PHASE;
  return phase === 'download' || phase === 'local' || phase === 'restart'
    ? phase
    : null;
}

function validCsv(): string {
  return 'title,text,color\n"First, quoted","Line 1\nLine 2",blue\n,,\nSecond,Body,\n';
}

function tooManyCsv(): string {
  return `title\n${Array.from({ length: 101 }, (_, index) => `Note ${index + 1}`).join('\n')}\n`;
}

export class T3HostController extends PluginHostController {
  private readonly management: PluginManagementService;
  private readonly directory: string;

  constructor(
    management: PluginManagementService,
    workspaceId: string,
    directory: string
  ) {
    super(management, workspaceId);
    this.management = management;
    this.directory = directory;
  }

  override async handle(
    request: Request,
    token: string,
    cors: HeadersInit
  ): Promise<Response | null> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/plugin-t3/')) {
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
        const operationPath = join(this.directory, 'import-operation.json');
        const operationFile = Bun.file(operationPath);
        return Response.json(
          {
            phase,
            operation: (await operationFile.exists())
              ? await operationFile.json()
              : null,
          },
          { headers }
        );
      }
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers });
      }
      if (url.pathname.endsWith('/prepare-file')) {
        return Response.json(
          await this.management.prepareFromFile(
            join(this.directory, 't3-combined.ghostboard-plugin')
          ),
          { headers }
        );
      }
      if (url.pathname.endsWith('/prepare-url')) {
        const packageUrl = process.env.GHOSTBOARD_PLUGIN_T3_URL;
        if (!packageUrl) {
          throw new Error('Missing T3 package URL');
        }
        return Response.json(
          await this.management.prepareFromUrl(packageUrl, {
            allowLoopback: true,
          }),
          { headers }
        );
      }
      if (url.pathname.endsWith('/select')) {
        const body = await request.json();
        const scenario =
          body && typeof body === 'object' && 'scenario' in body
            ? body.scenario
            : undefined;
        const path = join(this.directory, 'selected.csv');
        switch (scenario) {
          case 'cancel':
            await rm(path, { force: true });
            break;
          case 'invalid-utf8':
            await writeFile(path, Uint8Array.from([0xc3, 0x28]));
            break;
          case 'missing-title':
            await writeFile(path, 'text,color\nBody,blue\n');
            break;
          case 'oversized':
            await writeFile(path, new Uint8Array(1024 * 1024 + 1).fill(65));
            break;
          case 'too-many':
            await writeFile(path, tooManyCsv());
            break;
          case 'valid':
            await writeFile(path, validCsv());
            break;
          case 'wait':
            await writeFile(path, '__WAIT__\ntitle\nPending\n');
            break;
          default:
            throw new Error('Unknown T3 selection scenario');
        }
        return Response.json({ selected: scenario }, { headers });
      }
      if (url.pathname.endsWith('/record-operation')) {
        const body = await request.json();
        if (
          !body ||
          typeof body !== 'object' ||
          !('operationId' in body) ||
          typeof body.operationId !== 'string' ||
          !('ids' in body) ||
          !Array.isArray(body.ids) ||
          body.ids.some((id) => typeof id !== 'string')
        ) {
          throw new Error('Invalid T3 operation record');
        }
        await atomicWrite(
          join(this.directory, 'import-operation.json'),
          `${JSON.stringify({ ids: body.ids, operationId: body.operationId }, null, 2)}\n`
        );
        return Response.json({ saved: true }, { headers });
      }
      if (url.pathname.endsWith('/report')) {
        const body = await request.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new Error('Expected JSON report');
        }
        await atomicWrite(
          join(this.directory, `result-${phase}.json`),
          `${JSON.stringify(
            {
              ...body,
              phase,
              host: {
                platform: process.platform,
                arch: process.arch,
                bun: Bun.version,
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
        { error: String(error).replaceAll(token, '<redacted>') },
        { status: 400, headers }
      );
    }
  }
}
