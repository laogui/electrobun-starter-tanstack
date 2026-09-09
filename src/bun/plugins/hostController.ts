import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { InstalledPluginSummary } from '../../shared/plugins/management';
import type {
  PluginRuntimeDescriptor,
  PluginRuntimeSnapshot,
} from '../../shared/plugins/runtime';
import { type PluginDirectoryMount, pluginModulePath } from '../pluginAssets';
import { readPluginContents } from './directoryContents';
import { loadPluginDirectory } from './loadDirectory';
import {
  type PluginManagementService,
  pluginInstallErrorMessage,
} from './management';

interface RuntimeGeneration {
  development: boolean;
  digest: string;
  entry: string;
  mount: PluginDirectoryMount & { generation: string };
  name: string;
}

export class PluginHostController {
  private readonly service: PluginManagementService;
  private readonly workspaceId: string;
  private readonly generations = new Map<string, RuntimeGeneration>();
  // Keep the latest descriptor/digest even after release, so unchanged failed
  // code is not issued a fresh identity (and retried) on every poll.
  private readonly latest = new Map<string, RuntimeGeneration>();
  private readonly reloads = new Set<string>();
  private mounts: readonly PluginDirectoryMount[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(service: PluginManagementService, workspaceId: string) {
    this.service = service;
    this.workspaceId = workspaceId;
  }

  getMounts(): readonly PluginDirectoryMount[] {
    return this.mounts;
  }

  async handle(
    request: Request,
    token: string,
    corsHeaders: HeadersInit
  ): Promise<Response | null> {
    const url = new URL(request.url);
    if (
      url.pathname !== '/plugins/runtime' &&
      url.pathname !== '/plugins/reload' &&
      url.pathname !== '/plugins/release'
    ) {
      return null;
    }
    const headers = new Headers(corsHeaders);
    headers.set('Cache-Control', 'no-store');
    if (this.disposed) {
      return new Response('Plugin host disposed', { status: 410, headers });
    }
    const method = url.pathname === '/plugins/runtime' ? 'GET' : 'POST';
    if (request.method !== method) {
      return new Response('Method not allowed', { status: 405, headers });
    }
    const operation = this.queue
      .catch(() => undefined)
      .then(async () => {
        if (this.disposed) {
          return new Response('Plugin host disposed', { status: 410, headers });
        }
        if (url.pathname === '/plugins/release') {
          return await this.release(request, headers);
        }
        if (method === 'POST') {
          return await this.reload(request, headers);
        }
        const snapshot = await this.refresh(url.origin, token);
        return Response.json(snapshot, { headers });
      });
    this.queue = operation;
    try {
      return await operation;
    } catch (error) {
      return Response.json(
        { error: pluginInstallErrorMessage(error) },
        { status: 500, headers }
      );
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clear().catch(() => undefined);
  }

  private async clear(): Promise<void> {
    const directories = [...this.generations.values()].map(
      (entry) => entry.mount.directory
    );
    this.generations.clear();
    this.latest.clear();
    this.reloads.clear();
    this.mounts = [];
    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }).catch(() => undefined)
      )
    );
  }

  private async remove(pluginId: string): Promise<void> {
    this.latest.delete(pluginId);
    this.reloads.delete(pluginId);
    const removed = [...this.generations.values()].filter(
      (entry) => entry.mount.id === pluginId
    );
    for (const entry of removed) {
      this.generations.delete(entry.mount.generation);
    }
    this.updateMounts();
    await Promise.all(
      removed.map((entry) =>
        rm(entry.mount.directory, { recursive: true, force: true }).catch(
          () => undefined
        )
      )
    );
  }

  private updateMounts(): void {
    this.mounts = Object.freeze(
      [...this.generations.values()].map((entry) => entry.mount)
    );
  }

  private async release(request: Request, headers: Headers): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400, headers });
    }
    if (
      !body ||
      typeof body !== 'object' ||
      !('pluginId' in body) ||
      typeof body.pluginId !== 'string' ||
      !body.pluginId.trim() ||
      !('generation' in body) ||
      typeof body.generation !== 'string' ||
      !body.generation.trim()
    ) {
      return new Response('Missing pluginId or generation', {
        status: 400,
        headers,
      });
    }
    const current = this.generations.get(body.generation);
    if (current?.mount.id === body.pluginId) {
      await rm(current.mount.directory, { recursive: true, force: true });
      this.generations.delete(body.generation);
      this.updateMounts();
    }
    return Response.json({ success: true }, { headers });
  }

  private async reload(request: Request, headers: Headers): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400, headers });
    }
    if (
      !body ||
      typeof body !== 'object' ||
      !('pluginId' in body) ||
      typeof body.pluginId !== 'string' ||
      !body.pluginId.trim()
    ) {
      return new Response('Missing pluginId', { status: 400, headers });
    }
    const pluginId = body.pluginId;
    if (
      !(await this.service.list()).some((entry) => entry.pluginId === pluginId)
    ) {
      return new Response('Plugin not found', { status: 404, headers });
    }
    if (!this.disposed) {
      this.reloads.add(pluginId);
    }
    return Response.json({ success: true }, { headers });
  }

  private async generation(
    summary: InstalledPluginSummary
  ): Promise<RuntimeGeneration> {
    const loaded = await this.service.resolveRuntimePackage(summary);
    const contents = await readPluginContents(loaded.directory);
    const previous = this.latest.get(summary.pluginId);
    if (
      previous?.digest === contents.digest &&
      !this.reloads.has(summary.pluginId)
    ) {
      return previous;
    }
    // Immutable copies keep late imports on the original graph until the
    // renderer explicitly releases that generation, even if replacement fails.
    const directory = await mkdtemp(
      join(tmpdir(), 'ghostboard-plugin-runtime-')
    );
    try {
      for (const [path, content] of contents.files) {
        const destination = join(directory, path);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, content);
      }
      const snapshot = await loadPluginDirectory(directory);
      if (
        snapshot.manifest.id !== summary.pluginId ||
        JSON.stringify(snapshot.manifest) !== JSON.stringify(loaded.manifest) ||
        (await readPluginContents(loaded.directory)).digest !== contents.digest
      ) {
        throw new Error(
          'Plugin changed while loading. Waiting for a stable directory snapshot.'
        );
      }
      if (this.disposed) {
        throw new Error('Plugin host disposed');
      }
      const current: RuntimeGeneration = {
        development: summary.development === true,
        digest: contents.digest,
        entry: snapshot.manifest.entrypoints.app,
        mount: Object.freeze({
          directory,
          generation: randomUUID(),
          id: summary.pluginId,
          version: snapshot.manifest.version,
        }),
        name: snapshot.manifest.name,
      };
      this.generations.set(current.mount.generation, current);
      this.latest.set(summary.pluginId, current);
      this.reloads.delete(summary.pluginId);
      this.updateMounts();
      return current;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  private descriptor(
    current: RuntimeGeneration,
    origin: string,
    token: string
  ): PluginRuntimeDescriptor {
    return {
      development: current.development,
      entryUrl: new URL(
        `${pluginModulePath(token, current.mount)}${current.entry.split('/').map(encodeURIComponent).join('/')}`,
        origin
      ).href,
      generation: current.mount.generation,
      name: current.name,
      pluginId: current.mount.id,
      version: current.mount.version,
    };
  }

  private async refresh(
    origin: string,
    token: string
  ): Promise<PluginRuntimeSnapshot> {
    const snapshot: PluginRuntimeSnapshot = {
      workspaceId: this.workspaceId,
      plugins: [],
      diagnostics: [],
    };
    const summaries = await this.service.list();
    const active = new Set(
      summaries.filter((entry) => entry.enabled).map((entry) => entry.pluginId)
    );
    for (const pluginId of this.latest.keys()) {
      if (!active.has(pluginId)) {
        await this.remove(pluginId);
      }
    }
    for (const summary of summaries) {
      if (summary.validationError) {
        snapshot.diagnostics.push({
          pluginId: summary.pluginId,
          message: summary.validationError,
        });
      }
      if (!summary.enabled) {
        continue;
      }
      let current = this.latest.get(summary.pluginId);
      if (summary.status === 'stored') {
        try {
          current = await this.generation(summary);
        } catch (error) {
          snapshot.diagnostics.push({
            pluginId: summary.pluginId,
            message: pluginInstallErrorMessage(error),
          });
        }
      }
      if (current) {
        snapshot.plugins.push(this.descriptor(current, origin, token));
      }
    }
    return snapshot;
  }
}
