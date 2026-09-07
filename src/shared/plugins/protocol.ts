import { HOST_API_VERSION, isPluginId, PLUGIN_PROTOCOL_VERSION } from './ids';
import type { PluginManifest } from './manifest';

export const PLUGIN_CONTROL_MESSAGE_MAX_BYTES = 256 * 1024;

export type PluginErrorCode =
  | 'permission-denied'
  | 'unsupported-capability'
  | 'revision-conflict'
  | 'invalid-state'
  | 'resource-limit'
  | 'cancelled'
  | 'runtime-unavailable'
  | 'persistence-failed'
  | 'protocol-error'
  | 'timeout'
  | 'identity-mismatch';

export type PluginMessageType =
  | 'handshake'
  | 'handshake-ack'
  | 'invoke-command'
  | 'host-call'
  | 'permission-request'
  | 'permission-result'
  | 'response'
  | 'error'
  | 'dispose'
  | 'disposed'
  | 'timeout'
  | 'crash'
  | 'runtime-restart';

export type PluginContextKind = 'operation' | 'view' | 'instance';

export type PluginHostCallMethod =
  | 'content.readSelection'
  | 'content.applyBatch'
  | 'workspace.getIdentity'
  | 'fs.read'
  | 'net.fetch'
  | 'native.bridge'
  | 'plugins.getPeerState';

export type PluginContext =
  | { kind: 'operation'; operationId: string }
  | { kind: 'view'; viewSessionId: string }
  | { kind: 'instance'; instanceId: string };

export interface HostIssuedIdentity {
  epoch: number;
  hostApiVersion: string;
  nonce: string;
  pluginId: string;
  pluginVersion: string;
  protocolVersion: number;
  sessionId: string;
  workspaceId: string;
}

export interface PluginEnvelope {
  epoch?: number;
  instanceId?: string;
  payload?: unknown;
  pluginId?: string;
  requestId?: string;
  sessionId?: string;
  type: PluginMessageType;
  workspaceId?: string;
}

export interface PluginProtocolError {
  code: PluginErrorCode;
  message: string;
  requestId?: string;
}

export interface HandshakePayload {
  capabilities: string[];
  context: PluginContext;
  identity: HostIssuedIdentity;
}

export interface InvokeCommandPayload {
  commandId: string;
}

export interface HostCallPayload {
  args?: unknown;
  method: PluginHostCallMethod;
}

export interface PermissionRequestPayload {
  permission: string;
}

const MESSAGE_TYPES = new Set<PluginMessageType>([
  'handshake',
  'handshake-ack',
  'invoke-command',
  'host-call',
  'permission-request',
  'permission-result',
  'response',
  'error',
  'dispose',
  'disposed',
  'timeout',
  'crash',
  'runtime-restart',
]);

const HOST_CALL_METHODS = new Set<PluginHostCallMethod>([
  'content.readSelection',
  'content.applyBatch',
  'workspace.getIdentity',
  'fs.read',
  'net.fetch',
  'native.bridge',
  'plugins.getPeerState',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function encodedMessageSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function parsePluginEnvelope(
  input: unknown
): PluginEnvelope | PluginProtocolError {
  const value =
    typeof input === 'string'
      ? (() => {
          try {
            return JSON.parse(input) as unknown;
          } catch {
            return null;
          }
        })()
      : input;
  if (value === null && typeof input === 'string') {
    return { code: 'protocol-error', message: 'message is not valid JSON' };
  }
  if (encodedMessageSize(value) > PLUGIN_CONTROL_MESSAGE_MAX_BYTES) {
    return {
      code: 'resource-limit',
      message: 'control message exceeds 256 KiB',
    };
  }
  if (!isRecord(value) || typeof value.type !== 'string') {
    return { code: 'protocol-error', message: 'message must have a type' };
  }
  if (!MESSAGE_TYPES.has(value.type as PluginMessageType)) {
    return {
      code: 'protocol-error',
      message: `unknown message type: ${value.type}`,
    };
  }
  const envelope: PluginEnvelope = {
    type: value.type as PluginMessageType,
  };
  if (typeof value.requestId === 'string') {
    envelope.requestId = value.requestId;
  }
  if ('payload' in value) {
    envelope.payload = value.payload;
  }
  if (typeof value.pluginId === 'string') {
    envelope.pluginId = value.pluginId;
  }
  if (typeof value.workspaceId === 'string') {
    envelope.workspaceId = value.workspaceId;
  }
  if (typeof value.sessionId === 'string') {
    envelope.sessionId = value.sessionId;
  }
  if (typeof value.instanceId === 'string') {
    envelope.instanceId = value.instanceId;
  }
  if (typeof value.epoch === 'number' && Number.isInteger(value.epoch)) {
    envelope.epoch = value.epoch;
  }
  return envelope;
}

export function isPluginProtocolError(
  value: PluginEnvelope | PluginProtocolError
): value is PluginProtocolError {
  return 'code' in value;
}

export function createHandshakePayload(input: {
  context: PluginContext;
  identity: HostIssuedIdentity;
}): HandshakePayload {
  return {
    identity: input.identity,
    context: input.context,
    capabilities: ['commands', 'permissions', 'host-calls'],
  };
}

export function createHostIssuedIdentity(input: {
  epoch?: number;
  nonce: string;
  pluginId: string;
  pluginVersion: string;
  sessionId: string;
  workspaceId: string;
}): HostIssuedIdentity | PluginProtocolError {
  if (!isPluginId(input.pluginId)) {
    return { code: 'protocol-error', message: 'invalid pluginId' };
  }
  return {
    protocolVersion: PLUGIN_PROTOCOL_VERSION,
    hostApiVersion: HOST_API_VERSION,
    pluginId: input.pluginId,
    pluginVersion: input.pluginVersion,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    epoch: input.epoch ?? 1,
    nonce: input.nonce,
  };
}

export function createEnvelope(input: {
  payload?: unknown;
  requestId?: string;
  type: PluginMessageType;
}): PluginEnvelope {
  const envelope: PluginEnvelope = { type: input.type };
  if (input.requestId) {
    envelope.requestId = input.requestId;
  }
  if (input.payload !== undefined) {
    envelope.payload = input.payload;
  }
  return envelope;
}

export function isHostCallMethod(
  value: unknown
): value is PluginHostCallMethod {
  return (
    typeof value === 'string' &&
    HOST_CALL_METHODS.has(value as PluginHostCallMethod)
  );
}

export function commandContributionIds(manifest: PluginManifest): string[] {
  return manifest.contributes.commands.map((command) => command.id);
}
