// @vitest-environment jsdom
import React from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import * as sdk from '../../../../packages/plugin-sdk/index.js';
import sdkPackage from '../../../../packages/plugin-sdk/package.json';
import * as sdkReact from '../../../../packages/plugin-sdk/react.js';
import * as jsxRuntime from '../shared/jsx-runtime';
import * as react from '../shared/react';
import * as reactDom from '../shared/react-dom';
import * as reactDomClient from '../shared/react-dom-client';
import { PluginRuntime } from './PluginRuntime';
import { initializeSharedPluginRuntime } from './sharedRuntime';
import { startPluginRuntime } from './startPluginRuntime';

vi.mock('@/lib/rpc', () => ({
  rpcGetLocalHttpEndpoint: vi.fn(),
  rpcPickPluginFiles: vi.fn(),
  rpcReadPluginFileText: vi.fn(),
  rpcReleasePluginFiles: vi.fn(),
}));

const original = globalThis.__ghostboardPluginRuntime;
afterEach(() => {
  globalThis.__ghostboardPluginRuntime = original;
});

it('publishes a frozen, repeatable runtime with only the documented fields', () => {
  const runtime = initializeSharedPluginRuntime();
  expect(globalThis.__ghostboardPluginRuntime).toBe(runtime);
  expect(Object.isFrozen(runtime)).toBe(true);
  expect(Object.keys(runtime).sort()).toEqual([
    'jsxRuntime',
    'react',
    'reactDom',
    'reactDomClient',
    'sdk',
    'sdkReact',
    'version',
  ]);
  expect(runtime.version).toBe(sdkPackage.version);
  expect(Reflect.set(runtime, 'react', {})).toBe(false);
  expect(Reflect.set(runtime, 'privateHostApi', {})).toBe(false);
  expect(initializeSharedPluginRuntime()).toBe(runtime);
});

it('uses the import-map facade namespaces and the host export identities', () => {
  const runtime = initializeSharedPluginRuntime();
  expect(runtime.react).toBe(react);
  expect(runtime.reactDom).toBe(reactDom);
  expect(runtime.reactDomClient).toBe(reactDomClient);
  expect(runtime.jsxRuntime).toBe(jsxRuntime);
  expect(runtime.sdk).toBe(sdk);
  expect(runtime.sdkReact).toBe(sdkReact);
  expect(runtime.sdkReact.SelectionProvider).toBe(sdkReact.SelectionProvider);
  expect(runtime.react.default).toBe(React);
  expect(runtime.react.useState).toBe(React.useState);
  expect(runtime.reactDomClient.createRoot).toBe(createRoot);
  expect(runtime.jsxRuntime.Fragment).toBe(React.Fragment);
  expect(runtime.sdk.definePlugin).toBe(sdk.definePlugin);
});

it('initializes before startup can execute a plugin module', async () => {
  globalThis.__ghostboardPluginRuntime = undefined;
  const imported = vi.fn(async () => {
    expect(globalThis.__ghostboardPluginRuntime?.sdk).toBe(sdk);
    expect(Object.isFrozen(globalThis.__ghostboardPluginRuntime)).toBe(true);
    return { default: { setup: vi.fn() } };
  });
  const runtime = new PluginRuntime({ importer: imported });
  const stop = startPluginRuntime({
    runtime,
    getEndpoint: async () => ({
      baseUrl: 'http://127.0.0.1:12345',
      token: 'secret',
      aiEnabled: false,
    }),
    fetch: vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        workspaceId: 'work',
        diagnostics: [],
        plugins: [
          {
            pluginId: 'example.shared',
            name: 'Shared',
            version: '1',
            generation: '1',
            development: true,
            entryUrl: 'http://127.0.0.1/plugins/example.shared/app.js',
          },
        ],
      })
    ),
  });
  try {
    expect(globalThis.__ghostboardPluginRuntime).toMatchObject({ react });
    await vi.waitFor(() => expect(imported).toHaveBeenCalledOnce());
  } finally {
    await stop();
  }
});
