import { describe, expect, it } from 'vitest';

import { assertWorkspaceAttachmentPath } from './attachments';

describe('assertWorkspaceAttachmentPath', () => {
  const workspaceRoot = '/tmp/workspace';

  it('accepts normalized paths under attachments/', () => {
    const result = assertWorkspaceAttachmentPath(
      workspaceRoot,
      'attachments/sub/../img_a1b2c3d4.png'
    );

    expect(result.relativePath).toBe('attachments/img_a1b2c3d4.png');
    expect(result.fullPath).toBe('/tmp/workspace/attachments/img_a1b2c3d4.png');
  });

  it('rejects absolute paths', () => {
    expect(() =>
      assertWorkspaceAttachmentPath(
        workspaceRoot,
        '/tmp/workspace/attachments/a.png'
      )
    ).toThrow('Attachment path must be relative.');
  });

  it('rejects paths outside attachments/', () => {
    expect(() =>
      assertWorkspaceAttachmentPath(workspaceRoot, 'content/a.md')
    ).toThrow('Attachment path must stay inside attachments/.');

    expect(() =>
      assertWorkspaceAttachmentPath(workspaceRoot, 'attachments')
    ).toThrow('Attachment path must stay inside attachments/.');
  });

  it('rejects traversal attempts', () => {
    expect(() =>
      assertWorkspaceAttachmentPath(workspaceRoot, 'attachments/../secrets.txt')
    ).toThrow('Attachment path must stay inside attachments/.');
  });
});
