import type { useState } from 'react';
import {
  rpcCommitPluginInstall,
  rpcDisablePlugin,
  rpcEnablePlugin,
  rpcGetLocalHttpEndpoint,
  rpcListPluginPackages,
} from '@/lib/rpc';
import {
  definePlugin,
  type PluginContext,
} from '../../../../packages/plugin-sdk';
import type {
  InstalledPluginSummary,
  PluginInstallPreview,
} from '../../../shared/plugins/management';
import type { PluginRuntimeSnapshot } from '../../../shared/plugins/runtime';
import { pluginRuntime } from '../runtime';
import { requestPluginReload } from '../runtime/requestPluginReload';
import { verifyAtomicReload, waitForAssetStatus } from './verifyAtomicReload';

declare global {
  var __trustedPluginTest:
    | {
        events: string[];
        ticks: number;
        sdkDefinition?: typeof definePlugin;
        reactState?: typeof useState;
        sharedRuntimeIdentity?: boolean;
        reactContexts?: PluginContext[];
        reactCandidate?: PluginContext;
        rejectReactCandidate?: () => void;
      }
    | undefined;
}

async function waitFor(check: () => boolean, label: string) {
  const deadline = Date.now() + 12_000;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out: ${label}; runtime: ${JSON.stringify(pluginRuntime.getSnapshot())}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

export async function runT1Probe() {
  const endpoint = await rpcGetLocalHttpEndpoint();
  if (!endpoint) {
    throw new Error('T1 requires the packaged desktop app');
  }
  const request = async <T>(route: string, input?: unknown): Promise<T> => {
    const response = await fetch(`${endpoint.baseUrl}${route}`, {
      method: input === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        'Content-Type': 'application/json',
      },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`${route}: ${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  };
  const checks: Record<string, unknown> = {};
  const report: Record<string, unknown> = {
    stage: 'T1',
    startedAt: new Date().toISOString(),
    page: location.href,
    userAgent: navigator.userAgent,
    passed: false,
    checks,
  };
  const events = () => globalThis.__trustedPluginTest?.events ?? [];
  const command = (id: string, name: string) =>
    pluginRuntime
      .getSnapshot()
      .commands.some((entry) => entry.pluginId === id && entry.id === name);
  const running = (id: string) =>
    pluginRuntime
      .getSnapshot()
      .plugins.some(
        (entry) => entry.pluginId === id && entry.status === 'running'
      );
  const enable = async (plugin: InstalledPluginSummary) => {
    const result = await rpcEnablePlugin({
      pluginId: plugin.pluginId,
      digest: plugin.digest,
    });
    if (!result.success) {
      throw new Error(result.error);
    }
  };
  const disable = async (plugin: InstalledPluginSummary) => {
    const result = await rpcDisablePlugin({
      pluginId: plugin.pluginId,
      digest: plugin.digest,
    });
    if (!result.success) {
      throw new Error(result.error);
    }
  };
  const connect = async (fixture: string) => {
    const preview = await request<PluginInstallPreview>('/plugin-t1/prepare', {
      fixture,
    });
    const result = await rpcCommitPluginInstall(preview.transactionId);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.plugin;
  };
  try {
    if (!location.href.startsWith('views://mainview/')) {
      throw new Error('Expected a release views:// page');
    }
    const { phase } = await request<{ phase: string }>('/plugin-t1/config');
    await waitFor(
      () => !!pluginRuntime.getSnapshot().workspaceId,
      'initial host snapshot'
    );
    checks.workspaceId = pluginRuntime.getSnapshot().workspaceId;
    if (phase === 'workspace') {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const list = await rpcListPluginPackages();
      checks.applicationLevelDirectoriesRetained = list.plugins.length === 5;
      checks.workspaceDoesNotInheritEnablement =
        list.plugins.every((plugin) => !plugin.enabled) &&
        pluginRuntime.getSnapshot().plugins.length === 0;
      checks.noPluginCodeExecuted = events().length === 0;
      if (
        !(
          checks.applicationLevelDirectoriesRetained &&
          checks.workspaceDoesNotInheritEnablement &&
          checks.noPluginCodeExecuted
        )
      ) {
        throw new Error('Workspace activation leaked across restart');
      }
    } else {
      const plain = await connect('plain');
      const react = await connect('react');
      checks.directoryReviewDoesNotExecute = events().length === 0;
      if (!checks.directoryReviewDoesNotExecute) {
        throw new Error('Connection executed plugin code');
      }
      await enable(plain);
      await enable(react);
      await waitFor(
        () => running('t1.plain') && running('t1.react'),
        'activate external plugins'
      );
      checks.publicSdkSingleton =
        globalThis.__trustedPluginTest?.sdkDefinition === definePlugin;
      if (!checks.publicSdkSingleton) {
        throw new Error('Public SDK instance differs from host');
      }
      await pluginRuntime.runCommand('t1.plain', 'open');
      await waitFor(
        () =>
          document.querySelector('[data-t1-plain]')?.textContent ===
          'plain:one',
        'DOM mount'
      );
      pluginRuntime.closePanel('t1.plain', 'panel');
      if (
        document.querySelector('[data-t1-plain]') ||
        !command('t1.plain', 'open')
      ) {
        throw new Error('Closing a panel disabled its command or retained DOM');
      }
      await pluginRuntime.runCommand('t1.plain', 'record');
      if (!events().includes('plain:command:one')) {
        throw new Error('No-build command did not run');
      }
      checks.noBuildCommand = true;
      checks.closePreservesCommands = true;
      await pluginRuntime.runCommand('t1.plain', 'open');
      await waitFor(
        () => !!document.querySelector('[data-t1-plain]'),
        'DOM reopen'
      );
      checks.domReopen = true;
      await pluginRuntime.runCommand('t1.react', 'open');
      await waitFor(
        () =>
          document.querySelector('[data-t1-react]')?.textContent === 'react:0',
        'React initial render'
      );
      (document.querySelector('[data-t1-react]') as HTMLButtonElement).click();
      await waitFor(
        () =>
          document.querySelector('[data-t1-react]')?.textContent === 'react:1',
        'React useState'
      );
      pluginRuntime.closePanel('t1.react', 'panel');
      if (
        !(events().includes('react:unmount') && command('t1.react', 'open'))
      ) {
        throw new Error('React cleanup failed');
      }
      await pluginRuntime.runCommand('t1.react', 'open');
      await waitFor(
        () =>
          document.querySelector('[data-t1-react]')?.textContent === 'react:0',
        'React fresh root'
      );
      checks.reactHooksAndFreshRoots = true;
      (document.querySelector('[data-t1-react]') as HTMLButtonElement).click();
      await waitFor(
        () =>
          document.querySelector('[data-t1-react]')?.textContent === 'react:1',
        'panel before error'
      );
      (document.querySelector('[data-t1-react]') as HTMLButtonElement).click();
      await waitFor(
        () =>
          pluginRuntime
            .getSnapshot()
            .diagnostics.some(
              (entry) =>
                entry.pluginId === 't1.react' &&
                entry.message.includes('t1-panel-error')
            ),
        'React error includes message and source'
      );
      if (
        !(
          command('t1.plain', 'record') &&
          document.querySelector('#root')?.childElementCount
        )
      ) {
        throw new Error('Panel error damaged host or other plugin');
      }
      pluginRuntime.closePanel('t1.react', 'panel');
      await pluginRuntime.runCommand('t1.react', 'open');
      await waitFor(
        () =>
          document.querySelector('[data-t1-react]')?.textContent === 'react:0',
        'panel error recovery'
      );
      checks.reactErrorRecovery = true;
      Object.assign(checks, await verifyAtomicReload(request, waitFor));
      const beforeEdit =
        await request<PluginRuntimeSnapshot>('/plugins/runtime');
      const oldEntry = beforeEdit.plugins.find(
        (entry) => entry.pluginId === 't1.plain'
      )?.entryUrl;
      await request('/plugin-t1/edit-relative', {});
      await waitFor(
        () => events().includes('plain:setup:two'),
        'automatic relative-module reload'
      );
      if (
        !events().includes('plain:cleanup:one') ||
        document.querySelector('[data-t1-plain]')
      ) {
        throw new Error('Reload retained the old activation/view');
      }
      await pluginRuntime.runCommand('t1.plain', 'record');
      if (!events().includes('plain:command:two')) {
        throw new Error('Relative import cache was not invalidated');
      }
      checks.relativeModuleHotReload = true;
      checks.oldGenerationRevoked = oldEntry
        ? await waitForAssetStatus(oldEntry, 404)
        : false;
      if (!checks.oldGenerationRevoked) {
        throw new Error('Old generation remained mounted');
      }
      const setups = events().filter(
        (event) => event === 'plain:setup:two'
      ).length;
      await requestPluginReload('t1.plain');
      await waitFor(
        () =>
          events().filter((event) => event === 'plain:setup:two').length ===
          setups + 1,
        'manual fresh-generation reload'
      );
      checks.manualReload = true;
      if (
        pluginRuntime
          .getSnapshot()
          .commands.filter((entry) => entry.pluginId === 't1.plain').length !==
        2
      ) {
        throw new Error('Duplicate command registration after reload');
      }
      checks.noDuplicateRegistrations = true;
      const input = document.createElement('input');
      document.body.append(input);
      input.focus();
      const count = events().length;
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Y',
          altKey: true,
          shiftKey: true,
          bubbles: true,
        })
      );
      if (events().length !== count) {
        throw new Error('Shortcut intercepted text editing');
      }
      input.remove();
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Y', altKey: true, shiftKey: true })
      );
      await waitFor(() => events().length > count, 'command shortcut');
      checks.shortcutAndEditingProtection = true;
      const broken = await connect('broken');
      await enable(broken);
      await waitFor(
        () =>
          pluginRuntime
            .getSnapshot()
            .diagnostics.some(
              (entry) =>
                entry.pluginId === 't1.broken' &&
                entry.message.includes('t1-setup-error')
            ),
        'failed setup diagnostic'
      );
      if (command('t1.broken', 'must-disappear') || !running('t1.plain')) {
        throw new Error(
          'Failed activation leaked registrations or broke another plugin'
        );
      }
      checks.failedSetupCleanup = true;
      await request('/plugin-t1/fix-broken', {});
      await waitFor(
        () => running('t1.broken') && command('t1.broken', 'recovered'),
        'recover after code edit'
      );
      checks.failedPluginRecovery = true;
      const template = await connect('template-react');
      await enable(template);
      await waitFor(
        () => running('example.react-hello'),
        'activate separately built author template'
      );
      await pluginRuntime.runCommand('example.react-hello', 'open-hello');
      const templateButton = () =>
        document.querySelector<HTMLButtonElement>(
          '[data-plugin-panel="example.react-hello/hello"] > div button'
        );
      await waitFor(
        () => templateButton()?.textContent === 'Count: 0',
        'compiled author JSX'
      );
      templateButton()?.click();
      await waitFor(
        () => templateButton()?.textContent === 'Count: 1',
        'compiled author hook update'
      );
      const root = document.documentElement;
      const wasDark = root.classList.contains('dark');
      try {
        root.classList.remove('dark');
        const light = getComputedStyle(templateButton() as HTMLElement)
          .getPropertyValue('--gb-background')
          .trim();
        root.classList.add('dark');
        const dark = getComputedStyle(templateButton() as HTMLElement)
          .getPropertyValue('--gb-background')
          .trim();
        checks.publicThemeTokens = Boolean(light && dark && light !== dark);
      } finally {
        root.classList.toggle('dark', wasDark);
      }
      if (!checks.publicThemeTokens) {
        throw new Error('Public theme tokens did not follow the host theme');
      }
      await request('/plugin-t1/use-template-shim', {});
      await waitFor(() => !templateButton(), 'template shim replaces old root');
      await waitFor(
        () =>
          running('example.react-hello') &&
          command('example.react-hello', 'open-hello'),
        'activate optional global shim build'
      );
      await pluginRuntime.runCommand('example.react-hello', 'open-hello');
      await waitFor(
        () => templateButton()?.textContent === 'Count: 0',
        'shim JSX and vendored components'
      );
      templateButton()?.click();
      await waitFor(
        () => templateButton()?.textContent === 'Count: 1',
        'shim shares host React hooks'
      );
      checks.optionalBundlerShim = true;
      await disable(template);
      await waitFor(
        () =>
          !document.querySelector(
            '[data-plugin-panel="example.react-hello/hello"]'
          ),
        'disable compiled author template'
      );
      checks.independentReactTemplate = true;
      const slow = await connect('slow');
      await enable(slow);
      await waitFor(() => events().includes('slow:setup'), 'slow setup starts');
      await disable(slow);
      await waitFor(
        () => events().includes('slow:cleanup'),
        'disable during async setup'
      );
      await new Promise((resolve) => setTimeout(resolve, 2800));
      if (command('t1.slow', 'late') || running('t1.slow')) {
        throw new Error('Disabled async activation resurrected');
      }
      checks.asyncDisableRace = true;
      checks.pendingSetupSignalAborted = events().includes('slow:abort');
      if (!checks.pendingSetupSignalAborted) {
        throw new Error('Pending setup did not receive abort on disable');
      }
      await waitFor(
        () => (globalThis.__trustedPluginTest?.ticks ?? 0) > 0,
        'real Web Worker ticks'
      );
      await disable(plain);
      await disable(react);
      await disable(broken);
      await waitFor(
        () =>
          pluginRuntime.getSnapshot().commands.length === 0 &&
          pluginRuntime.getSnapshot().panels.length === 0,
        'disable removes commands and roots'
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      const ticks = globalThis.__trustedPluginTest?.ticks;
      await new Promise((resolve) => setTimeout(resolve, 250));
      checks.trackedWorkerTerminated =
        globalThis.__trustedPluginTest?.ticks === ticks;
      checks.disableCleanup = !(
        document.querySelector('[data-t1-react]') ||
        document.querySelector('[data-t1-plain]')
      );
      checks.activeSignalAbortedOnDisable =
        globalThis.__trustedPluginTest?.reactContexts?.every(
          (context) => context.signal.aborted
        ) === true;
      if (!checks.activeSignalAbortedOnDisable) {
        throw new Error('Active React signal did not abort on disable');
      }
      if (!(checks.trackedWorkerTerminated && checks.disableCleanup)) {
        throw new Error('Disable retained resources');
      }
      let legacyRejected = false;
      try {
        await connect('legacy');
      } catch (error) {
        legacyRejected = String(error).includes('v2');
      }
      checks.legacyRejected = legacyRejected;
      if (!legacyRejected) {
        throw new Error('Legacy directory was accepted');
      }
      await enable(plain);
      await waitFor(
        () => running('t1.plain'),
        'leave one workspace-specific activation for restart check'
      );
      checks.hostStillMounted =
        !!document.querySelector('#root')?.childElementCount;
      if (!checks.hostStillMounted) {
        throw new Error('Host UI lost its root');
      }
    }
    report.passed = true;
  } catch (error) {
    report.error = (
      error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
        : String(error)
    ).replaceAll(endpoint.token, '<redacted>');
    report.runtime = pluginRuntime.getSnapshot();
    report.events = events();
  } finally {
    report.finishedAt = new Date().toISOString();
    const panel = document.createElement('pre');
    panel.id = 'plugin-t1-evidence';
    panel.style.cssText =
      'position:fixed;top:60px;right:20px;width:440px;max-height:70vh;overflow:auto;background:white;color:black;padding:16px;border:2px solid blue;z-index:2147483647;white-space:pre-wrap';
    panel.textContent = JSON.stringify(report, null, 2);
    document.body.append(panel);
    await request('/plugin-t1/report', report);
  }
}
