import { cp, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { atomicWrite } from '../atomicWrite';
import { PluginHostController } from './hostController';
import type { PluginManagementService } from './management';
import { probeEnv } from './probeGate';

// Packaged-app acceptance controls are only installed with an explicit test directory.
export class T1HostController extends PluginHostController {
  private readonly management: PluginManagementService;
  private readonly directory: string;
  private originalReact: string | undefined;

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
    corsHeaders: HeadersInit
  ): Promise<Response | null> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/plugin-t1/')) {
      return super.handle(request, token, corsHeaders);
    }
    try {
      const headers = new Headers(corsHeaders);
      headers.set('Cache-Control', 'no-store');
      if (url.pathname === '/plugin-t1/config' && request.method === 'GET') {
        return Response.json(
          { phase: probeEnv().GHOSTBOARD_PLUGIN_T1_PHASE ?? 'lifecycle' },
          { headers }
        );
      }
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers });
      }
      const value = await request.json();
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Expected a JSON object');
      }
      const body = value as Record<string, unknown>;
      if (url.pathname === '/plugin-t1/prepare') {
        if (
          typeof body.fixture !== 'string' ||
          ![
            'plain',
            'react',
            'broken',
            'slow',
            'legacy',
            'template-react',
          ].includes(body.fixture)
        ) {
          throw new Error('Unknown fixture');
        }
        return Response.json(
          await this.management.prepareDevelopmentDirectory(
            join(this.directory, body.fixture)
          ),
          { headers }
        );
      }
      if (url.pathname === '/plugin-t1/use-template-shim') {
        await cp(
          join(this.directory, 'template-react-shim'),
          join(this.directory, 'template-react'),
          { recursive: true }
        );
        return Response.json({ saved: true }, { headers });
      }
      if (url.pathname === '/plugin-t1/edit-react') {
        const path = join(this.directory, 'react', 'app.js');
        this.originalReact ??= await readFile(path, 'utf8');
        let source: string;
        if (body.mode === 'import-failure') {
          source = "import './missing-candidate-module.js';\n";
        } else if (body.mode === 'setup-failure') {
          source = await readFile(
            join(this.directory, 'react', 'candidate-setup.txt'),
            'utf8'
          );
        } else if (body.mode === 'restore') {
          source = this.originalReact;
        } else {
          throw new Error('Unknown edit mode');
        }
        await atomicWrite(path, source);
        return Response.json({ saved: true }, { headers });
      }
      if (url.pathname === '/plugin-t1/edit-relative') {
        await atomicWrite(
          join(this.directory, 'plain', 'label.js'),
          "export const label = 'two';\n"
        );
        return Response.json({ saved: true }, { headers });
      }
      if (url.pathname === '/plugin-t1/fix-broken') {
        await atomicWrite(
          join(this.directory, 'broken', 'app.js'),
          "import { definePlugin } from '@ghostboard/sdk'; export default definePlugin({ setup(app) { app.commands.register({id:'recovered',title:'T1 recovered',run(){}}); } });\n"
        );
        return Response.json({ saved: true }, { headers });
      }
      if (url.pathname === '/plugin-t1/report') {
        const phase = probeEnv().GHOSTBOARD_PLUGIN_T1_PHASE ?? 'lifecycle';
        const report = {
          ...body,
          host: {
            platform: process.platform,
            arch: process.arch,
            bun: Bun.version,
            execPath: process.execPath,
          },
          phase,
        };
        await atomicWrite(
          join(this.directory, `result-${phase}.json`),
          `${JSON.stringify(report, null, 2).replaceAll(token, '<redacted>')}\n`
        );
        return Response.json({ saved: true }, { headers });
      }
      return new Response('Not found', { status: 404, headers });
    } catch (error) {
      return Response.json(
        {
          error: (error instanceof Error
            ? error.message
            : String(error)
          ).replaceAll(token, '<redacted>'),
        },
        { status: 400, headers: corsHeaders }
      );
    }
  }
}
