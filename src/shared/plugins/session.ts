import {
  generatePluginNonce,
  generatePluginOperationId,
  generatePluginRequestId,
  generatePluginSessionId,
  generatePluginViewSessionId,
} from './ids';
import { type PluginManifest, SUPPORTED_PLUGIN_PERMISSIONS } from './manifest';
import {
  createEnvelope,
  createHandshakePayload,
  createHostIssuedIdentity,
  type HandshakePayload,
  type HostCallPayload,
  type HostIssuedIdentity,
  isHostCallMethod,
  isPluginProtocolError,
  type PluginContext,
  type PluginEnvelope,
  type PluginErrorCode,
  type PluginHostCallMethod,
  type PluginProtocolError,
  parsePluginEnvelope,
} from './protocol';

const METHOD_PERMISSIONS: Record<PluginHostCallMethod, string | null> = {
  'content.readSelection': 'content.selection.read',
  'content.applyBatch': 'content.selection.write',
  'workspace.getIdentity': null,
  'fs.read': 'filesystem',
  'net.fetch': 'network',
  'native.bridge': 'native-bridge',
  'plugins.getPeerState': 'other-plugin-data',
};

export interface PluginRuntimeSession {
  context: PluginContext;
  disposed: boolean;
  grantedPermissions: Set<string>;
  identity: HostIssuedIdentity;
  manifest: PluginManifest;
  pendingRequestIds: Set<string>;
}

export type SessionReceiveResult =
  | { ok: true; envelope: PluginEnvelope }
  | { ok: false; error: PluginProtocolError };

export function createPluginSession(input: {
  context: PluginContext;
  grantedPermissions?: Iterable<string>;
  manifest: PluginManifest;
  workspaceId: string;
}): PluginRuntimeSession {
  const identity = createHostIssuedIdentity({
    pluginId: input.manifest.id,
    pluginVersion: input.manifest.version,
    workspaceId: input.workspaceId,
    sessionId: generatePluginSessionId(),
    nonce: generatePluginNonce(),
  });
  if ('code' in identity) {
    throw new Error(identity.message);
  }
  return {
    identity,
    context: input.context,
    manifest: input.manifest,
    grantedPermissions: new Set(
      [...(input.grantedPermissions ?? [])].filter(
        (permission) =>
          SUPPORTED_PLUGIN_PERMISSIONS.has(permission) &&
          [
            ...input.manifest.permissions.required,
            ...input.manifest.permissions.optional,
          ].some((declaration) => declaration.id === permission)
      )
    ),
    pendingRequestIds: new Set(),
    disposed: false,
  };
}

export function createOperationContext(): PluginContext {
  return { kind: 'operation', operationId: generatePluginOperationId() };
}

export function createViewContext(): PluginContext {
  return { kind: 'view', viewSessionId: generatePluginViewSessionId() };
}

export function createInstanceContext(instanceId: string): PluginContext {
  return { kind: 'instance', instanceId };
}

export function issueHandshake(session: PluginRuntimeSession): PluginEnvelope {
  const payload: HandshakePayload = createHandshakePayload({
    identity: session.identity,
    context: session.context,
  });
  return createEnvelope({ type: 'handshake', payload });
}

export function invokeCommand(
  session: PluginRuntimeSession,
  commandId: string
): PluginEnvelope | PluginProtocolError {
  if (session.disposed) {
    return { code: 'runtime-unavailable', message: 'session is disposed' };
  }
  if (session.context.kind !== 'operation') {
    return {
      code: 'invalid-state',
      message: 'commands require an operation context',
    };
  }
  const known = session.manifest.contributes.commands.some(
    (command) => command.id === commandId
  );
  if (!known) {
    return {
      code: 'unsupported-capability',
      message: `unknown command: ${commandId}`,
    };
  }
  const requestId = generatePluginRequestId();
  session.pendingRequestIds.add(requestId);
  return createEnvelope({
    type: 'invoke-command',
    requestId,
    payload: {
      commandId,
      operationId: session.context.operationId,
    },
  });
}

export function authorizeHostCall(
  session: PluginRuntimeSession,
  method: PluginHostCallMethod
): PluginErrorCode | null {
  if (session.disposed) {
    return 'runtime-unavailable';
  }
  const permission = METHOD_PERMISSIONS[method];
  if (permission && !session.grantedPermissions.has(permission)) {
    return 'permission-denied';
  }
  return null;
}

export function receivePluginMessage(
  session: PluginRuntimeSession,
  input: unknown
): SessionReceiveResult {
  if (session.disposed) {
    return {
      ok: false,
      error: { code: 'runtime-unavailable', message: 'session is disposed' },
    };
  }
  const parsed = parsePluginEnvelope(input);
  if (isPluginProtocolError(parsed)) {
    return { ok: false, error: parsed };
  }
  const spoof = identityMismatch(session, parsed);
  if (spoof) {
    return {
      ok: false,
      error: {
        code: 'identity-mismatch',
        message: spoof,
        requestId: parsed.requestId,
      },
    };
  }
  if (parsed.type === 'host-call') {
    return receiveHostCall(session, parsed);
  }
  if (parsed.type === 'permission-request') {
    return receivePermissionRequest(session, parsed);
  }
  if (parsed.type === 'disposed') {
    session.disposed = true;
    session.pendingRequestIds.clear();
    return { ok: true, envelope: parsed };
  }
  if (parsed.requestId) {
    session.pendingRequestIds.delete(parsed.requestId);
  }
  return { ok: true, envelope: parsed };
}

export function timeoutRequest(
  session: PluginRuntimeSession,
  requestId: string
): PluginEnvelope | PluginProtocolError {
  if (!session.pendingRequestIds.has(requestId)) {
    return { code: 'invalid-state', message: 'unknown requestId' };
  }
  session.pendingRequestIds.delete(requestId);
  return createEnvelope({
    type: 'timeout',
    requestId,
    payload: { code: 'timeout' },
  });
}

export function crashSession(session: PluginRuntimeSession): PluginEnvelope {
  session.disposed = true;
  session.pendingRequestIds.clear();
  return createEnvelope({
    type: 'crash',
    payload: { reason: 'plugin-crash' },
  });
}

export function disposeSession(
  session: PluginRuntimeSession,
  reason = 'host-dispose'
): PluginEnvelope {
  session.disposed = true;
  session.pendingRequestIds.clear();
  return createEnvelope({
    type: 'dispose',
    payload: { reason },
  });
}

export function restartSession(
  session: PluginRuntimeSession
): PluginRuntimeSession {
  disposeSession(session, 'runtime-restart');
  const next = createPluginSession({
    manifest: session.manifest,
    workspaceId: session.identity.workspaceId,
    context: cloneContext(session.context),
    grantedPermissions: session.grantedPermissions,
  });
  next.identity.epoch = session.identity.epoch + 1;
  return next;
}

function cloneContext(context: PluginContext): PluginContext {
  if (context.kind === 'operation') {
    return createOperationContext();
  }
  if (context.kind === 'view') {
    return createViewContext();
  }
  return createInstanceContext(context.instanceId);
}

function identityMismatch(
  session: PluginRuntimeSession,
  envelope: PluginEnvelope
): string | null {
  if (envelope.pluginId && envelope.pluginId !== session.identity.pluginId) {
    return 'pluginId does not match host-issued identity';
  }
  if (
    envelope.workspaceId &&
    envelope.workspaceId !== session.identity.workspaceId
  ) {
    return 'workspaceId does not match host-issued identity';
  }
  if (envelope.sessionId && envelope.sessionId !== session.identity.sessionId) {
    return 'sessionId does not match host-issued identity';
  }
  if (
    envelope.epoch !== undefined &&
    envelope.epoch !== session.identity.epoch
  ) {
    return 'epoch does not match current session';
  }
  if (envelope.instanceId) {
    if (session.context.kind !== 'instance') {
      return 'instanceId is not valid outside instance context';
    }
    if (envelope.instanceId !== session.context.instanceId) {
      return 'instanceId does not match host-issued identity';
    }
  }
  if (envelope.type === 'handshake-ack' && isRecord(envelope.payload)) {
    const claimedId = envelope.payload.pluginId;
    if (
      typeof claimedId === 'string' &&
      claimedId !== session.identity.pluginId
    ) {
      return 'pluginId does not match host-issued identity';
    }
    const claimedWorkspace = envelope.payload.workspaceId;
    if (
      typeof claimedWorkspace === 'string' &&
      claimedWorkspace !== session.identity.workspaceId
    ) {
      return 'workspaceId does not match host-issued identity';
    }
    const claimedInstance = envelope.payload.instanceId;
    if (
      typeof claimedInstance === 'string' &&
      (session.context.kind !== 'instance' ||
        claimedInstance !== session.context.instanceId)
    ) {
      return 'instanceId does not match host-issued identity';
    }
  }
  return null;
}

function receiveHostCall(
  session: PluginRuntimeSession,
  envelope: PluginEnvelope
): SessionReceiveResult {
  if (
    !(isRecord(envelope.payload) && isHostCallMethod(envelope.payload.method))
  ) {
    return {
      ok: false,
      error: {
        code: 'protocol-error',
        message: 'host-call requires a known method',
        requestId: envelope.requestId,
      },
    };
  }
  const denied = authorizeHostCall(session, envelope.payload.method);
  if (denied) {
    return {
      ok: false,
      error: {
        code: denied,
        message: `host call denied: ${envelope.payload.method}`,
        requestId: envelope.requestId,
      },
    };
  }
  const payload: HostCallPayload = {
    method: envelope.payload.method,
    args: envelope.payload.args,
  };
  return {
    ok: true,
    envelope: { ...envelope, payload },
  };
}

function receivePermissionRequest(
  session: PluginRuntimeSession,
  envelope: PluginEnvelope
): SessionReceiveResult {
  if (
    !isRecord(envelope.payload) ||
    typeof envelope.payload.permission !== 'string'
  ) {
    return {
      ok: false,
      error: {
        code: 'protocol-error',
        message: 'permission-request requires a permission id',
        requestId: envelope.requestId,
      },
    };
  }
  const granted = session.grantedPermissions.has(envelope.payload.permission);
  return {
    ok: true,
    envelope: createEnvelope({
      type: 'permission-result',
      requestId: envelope.requestId,
      payload: {
        permission: envelope.payload.permission,
        granted,
      },
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
