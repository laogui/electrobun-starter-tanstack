import { join } from 'node:path';
import { atomicWrite } from '../atomicWrite';
import { PluginHostController } from './hostController';
import type { PluginManagementService } from './management';

// Acceptance controls are installed only when an isolated test directory is provided.
export class T2A4HostController extends PluginHostController {
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
    corsHeaders: HeadersInit
  ): Promise<Response | null> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/plugin-t2-a4/')) {
      return super.handle(request, token, corsHeaders);
    }
    const headers = new Headers(corsHeaders);
    headers.set('Cache-Control', 'no-store');
    const phase = process.env.GHOSTBOARD_PLUGIN_T2_A4_PHASE;
    if (
      !(phase && ['initial', 'restart', 'workspace', 'return'].includes(phase))
    ) {
      return new Response('Invalid test phase', { status: 400, headers });
    }
    try {
      if (url.pathname === '/plugin-t2-a4/config' && request.method === 'GET') {
        return Response.json({ phase }, { headers });
      }
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers });
      }
      if (url.pathname === '/plugin-t2-a4/prepare') {
        return Response.json(
          await this.management.prepareDevelopmentDirectory(
            join(this.directory, 'fixture')
          ),
          { headers }
        );
      }
      if (url.pathname === '/plugin-t2-a4/report') {
        const body = await request.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new Error('Expected a JSON report');
        }
        await atomicWrite(
          join(this.directory, `result-${phase}.json`),
          `${JSON.stringify({ ...body, phase, host: { platform: process.platform, arch: process.arch, bun: Bun.version } }, null, 2).replaceAll(token, '<redacted>')}\n`
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
