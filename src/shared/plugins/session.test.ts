import { describe, expect, it } from 'vitest';

import { PLUGIN_OPERATION_ID_RE } from './ids';
import { isPluginManifestError, parsePluginManifest } from './manifest';
import {
  PLUGIN_CONTROL_MESSAGE_MAX_BYTES,
  parsePluginEnvelope,
} from './protocol';
import {
  authorizeHostCall,
  crashSession,
  createInstanceContext,
  createOperationContext,
  createPluginSession,
  createViewContext,
  disposeSession,
  invokeCommand,
  issueHandshake,
  receivePluginMessage,
  restartSession,
  timeoutRequest,
} from './session';

function titleToolsManifest() {
  const parsed = parsePluginManifest({
    manifestVersion: 1,
    id: 'community.alice.title-tools',
    name: '标题整理',
    version: '1.0.0',
    engines: { hostApi: '>=1.0.0 <2.0.0' },
    permissions: {
      required: [{ id: 'content.selection.read', reason: 'read titles' }],
    },
    contributes: {
      commands: [
        {
          id: 'normalize-titles',
          name: '整理选中资料标题',
          handler: 'main.js#normalizeTitles',
        },
      ],
    },
  });
  if (isPluginManifestError(parsed)) {
    throw new Error(parsed.message);
  }
  return parsed;
}

function operationSession(permissions: string[] = ['content.selection.read']) {
  return createPluginSession({
    manifest: titleToolsManifest(),
    workspaceId: 'ws_test',
    context: createOperationContext(),
    grantedPermissions: permissions,
  });
}

describe('plugin runtime session', () => {
  it('never grants undeclared or unsupported permissions from supplied grants', () => {
    const session = operationSession([
      'content.selection.read',
      'content.selection.write',
      'future.magic',
      'native-bridge',
    ]);
    expect([...session.grantedPermissions]).toEqual(['content.selection.read']);
    expect(authorizeHostCall(session, 'content.applyBatch')).toBe(
      'permission-denied'
    );
    expect(authorizeHostCall(session, 'native.bridge')).toBe(
      'permission-denied'
    );
  });

  it('returns structured errors for non-JSON control messages', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const session = operationSession();
    for (const args of [1n, cyclic, Number.NaN, () => undefined]) {
      expect(
        receivePluginMessage(session, {
          type: 'host-call',
          payload: { method: 'content.readSelection', args },
        })
      ).toMatchObject({ ok: false, error: { code: 'protocol-error' } });
    }
    expect(
      receivePluginMessage(session, {
        type: 'host-call',
        payload: { method: 'content.readSelection' },
      }).ok
    ).toBe(true);
    expect(parsePluginEnvelope('null')).toMatchObject({
      code: 'protocol-error',
      message: 'message must have a type',
    });
  });
  it('issues host identity on handshake and keeps operation context free of instanceId', () => {
    const session = operationSession();
    const handshake = issueHandshake(session);
    expect(handshake.type).toBe('handshake');
    const payload = handshake.payload as {
      identity: { pluginId: string; workspaceId: string; sessionId: string };
      context: { kind: string; operationId?: string; instanceId?: string };
    };
    expect(payload.identity.pluginId).toBe('community.alice.title-tools');
    expect(payload.identity.workspaceId).toBe('ws_test');
    expect(payload.identity.sessionId).toBe(session.identity.sessionId);
    expect(payload.context.kind).toBe('operation');
    expect(payload.context.operationId).toMatch(PLUGIN_OPERATION_ID_RE);
    expect(payload.context.instanceId).toBeUndefined();

    const invoked = invokeCommand(session, 'normalize-titles');
    expect('type' in invoked && invoked.type).toBe('invoke-command');
    if (!('payload' in invoked)) {
      return;
    }
    expect(invoked.payload).toMatchObject({
      commandId: 'normalize-titles',
      operationId:
        session.context.kind === 'operation' && session.context.operationId,
    });
    expect(invoked).not.toHaveProperty('instanceId');
  });

  it('rejects spoofed plugin, workspace, session, and instance identity', () => {
    const session = operationSession();
    expect(
      receivePluginMessage(session, {
        type: 'handshake-ack',
        pluginId: 'evil.other.plugin',
      })
    ).toMatchObject({
      ok: false,
      error: { code: 'identity-mismatch' },
    });
    expect(
      receivePluginMessage(session, {
        type: 'handshake-ack',
        workspaceId: 'ws_other',
      })
    ).toMatchObject({
      ok: false,
      error: { code: 'identity-mismatch' },
    });
    expect(
      receivePluginMessage(session, {
        type: 'handshake-ack',
        sessionId: 'plgsess_forged',
      })
    ).toMatchObject({
      ok: false,
      error: { code: 'identity-mismatch' },
    });
    expect(
      receivePluginMessage(session, {
        type: 'host-call',
        instanceId: 'extinst_fake',
        payload: { method: 'content.readSelection' },
      })
    ).toMatchObject({
      ok: false,
      error: { code: 'identity-mismatch' },
    });
    expect(
      receivePluginMessage(session, {
        type: 'handshake-ack',
        payload: { pluginId: 'evil.other.plugin', workspaceId: 'ws_test' },
      })
    ).toMatchObject({
      ok: false,
      error: { code: 'identity-mismatch' },
    });
  });

  it('keeps operation, view, and instance contexts distinct', () => {
    const operation = operationSession();
    const view = createPluginSession({
      manifest: titleToolsManifest(),
      workspaceId: 'ws_test',
      context: createViewContext(),
    });
    const instance = createPluginSession({
      manifest: titleToolsManifest(),
      workspaceId: 'ws_test',
      context: createInstanceContext('extinst_abc'),
    });

    expect(invokeCommand(view, 'normalize-titles')).toMatchObject({
      code: 'invalid-state',
    });
    expect(issueHandshake(view).payload).toMatchObject({
      context: { kind: 'view' },
    });
    expect(issueHandshake(instance).payload).toMatchObject({
      context: { kind: 'instance', instanceId: 'extinst_abc' },
    });
    expect(
      receivePluginMessage(instance, {
        type: 'host-call',
        instanceId: 'extinst_abc',
        payload: { method: 'workspace.getIdentity' },
      }).ok
    ).toBe(true);
    expect(operation.context.kind).toBe('operation');
    expect(view.context.kind).toBe('view');
    expect(instance.context.kind).toBe('instance');
  });

  it('denies unauthorized file, network, native bridge, and peer plugin access', () => {
    const session = operationSession(['content.selection.read']);
    expect(authorizeHostCall(session, 'content.readSelection')).toBeNull();
    expect(authorizeHostCall(session, 'fs.read')).toBe('permission-denied');
    expect(authorizeHostCall(session, 'net.fetch')).toBe('permission-denied');
    expect(authorizeHostCall(session, 'native.bridge')).toBe(
      'permission-denied'
    );
    expect(authorizeHostCall(session, 'plugins.getPeerState')).toBe(
      'permission-denied'
    );
    expect(
      receivePluginMessage(session, {
        type: 'host-call',
        payload: { method: 'fs.read' },
      })
    ).toMatchObject({
      ok: false,
      error: { code: 'permission-denied' },
    });
    expect(
      receivePluginMessage(session, {
        type: 'permission-request',
        payload: { permission: 'network' },
      })
    ).toMatchObject({
      ok: true,
      envelope: { payload: { permission: 'network', granted: false } },
    });
  });

  it('times out in-flight commands, isolates crashes, and rejects stale epochs after restart', () => {
    const session = operationSession();
    const invoked = invokeCommand(session, 'normalize-titles');
    if (!('requestId' in invoked && invoked.requestId)) {
      throw new Error('expected invoke requestId');
    }
    expect(timeoutRequest(session, invoked.requestId)).toMatchObject({
      type: 'timeout',
      requestId: invoked.requestId,
    });

    const crashed = operationSession();
    expect(crashSession(crashed).type).toBe('crash');
    expect(
      receivePluginMessage(crashed, { type: 'handshake-ack' })
    ).toMatchObject({
      ok: false,
      error: { code: 'runtime-unavailable' },
    });

    const live = operationSession();
    const previousEpoch = live.identity.epoch;
    const restarted = restartSession(live);
    expect(live.disposed).toBe(true);
    expect(restarted.identity.epoch).toBe(previousEpoch + 1);
    expect(restarted.identity.sessionId).not.toBe(live.identity.sessionId);
    expect(
      receivePluginMessage(restarted, {
        type: 'handshake-ack',
        epoch: previousEpoch,
      })
    ).toMatchObject({
      ok: false,
      error: { code: 'identity-mismatch' },
    });
    expect(disposeSession(restarted).type).toBe('dispose');
    expect(
      receivePluginMessage(restarted, { type: 'host-call' })
    ).toMatchObject({
      ok: false,
      error: { code: 'runtime-unavailable' },
    });
  });

  it('rejects oversized control messages', () => {
    const session = operationSession();
    const oversized = {
      type: 'host-call',
      payload: {
        method: 'workspace.getIdentity',
        pad: 'x'.repeat(PLUGIN_CONTROL_MESSAGE_MAX_BYTES),
      },
    };
    expect(receivePluginMessage(session, oversized)).toMatchObject({
      ok: false,
      error: { code: 'resource-limit' },
    });
  });
});
