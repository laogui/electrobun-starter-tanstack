import * as sdk from '../../../../packages/plugin-sdk/index.js';
import sdkPackage from '../../../../packages/plugin-sdk/package.json';
import * as sdkReact from '../../../../packages/plugin-sdk/react.js';
import * as jsxRuntime from '../shared/jsx-runtime';
import * as react from '../shared/react';
import * as reactDom from '../shared/react-dom';
import * as reactDomClient from '../shared/react-dom-client';

const sharedRuntime = Object.freeze({
  react,
  reactDom,
  reactDomClient,
  jsxRuntime,
  sdk,
  sdkReact,
  version: sdkPackage.version,
});

export type SharedPluginRuntime = typeof sharedRuntime;

declare global {
  var __ghostboardPluginRuntime: SharedPluginRuntime | undefined;
}

export function initializeSharedPluginRuntime(): SharedPluginRuntime {
  globalThis.__ghostboardPluginRuntime = sharedRuntime;
  return sharedRuntime;
}
