import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHECKLIST_CANVAS_TYPE_ID,
  POMODORO_CANVAS_TYPE_ID,
  REMINDER_CANVAS_TYPE_ID,
} from '../shared/extensions/builtinIds';
import type { D2FixtureNode } from '../test/projectFixture';
import {
  createD2ProjectFixture,
  D2_DELIVERY_VIEW_ID,
  D2_DETACHED_NOTE_ID,
  D2_FOLDER_ID,
  D2_GROUP_ID,
  D2_INSTANCE_IDS,
  D2_LEGACY_WIDGET_ID,
  D2_PROJECT_FIXTURE_ID,
  D2_RESEARCH_VIEW_ID,
  D2_SHARED_NOTE_ID,
  writeD2ProjectFixture,
} from '../test/projectFixture';
import { searchWorkspace } from './search';

vi.mock('electrobun/bun', () => ({
  Utils: { paths: { userData: '/mock-user-data' } },
}));

function setBunFile(): void {
  vi.stubGlobal('Bun', {
    file: vi.fn((filePath: string) => ({
      exists: async () => existsSync(filePath),
      json: async () => JSON.parse(readFileSync(filePath, 'utf8')),
      text: async () => readFileSync(filePath, 'utf8'),
    })),
    write: vi.fn(),
  });
}

describe('D2-1 project fixture', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'd2-project-fixture-'));
    setBunFile();
  });

  it('creates a deterministic inventory with only supported placements', () => {
    const first = writeD2ProjectFixture(workspaceRoot);
    const second = createD2ProjectFixture();

    expect(first).toEqual(second);
    expect(first.id).toBe(D2_PROJECT_FIXTURE_ID);
    expect(first.expected).toEqual({
      attachmentCount: 4,
      canvasCount: 2,
      distinctNoteCount: 4,
      folderChildCount: 5,
      productivityCount: 3,
      reusedNoteId: D2_SHARED_NOTE_ID,
      unlinkedCount: 4,
    });
    expect(first.views.map((view) => view.id)).toEqual([
      D2_RESEARCH_VIEW_ID,
      D2_DELIVERY_VIEW_ID,
    ]);

    const sharedRefs = first.views.flatMap((view) =>
      view.nodes.filter((node) => node.data.noteId === D2_SHARED_NOTE_ID)
    );
    expect(sharedRefs.map((node) => node.id)).toEqual([
      'd2-shared-research',
      'd2-shared-delivery',
    ]);

    const researchView = first.views.find(
      (view) => view.id === D2_RESEARCH_VIEW_ID
    );
    expect(researchView).toBeDefined();
    const groupChildren = researchView!.nodes.filter(
      (node) => node.parentId === D2_GROUP_ID
    );
    expect(groupChildren.length).toBe(3);
    expect(groupChildren.some((node) => node.id === 'd2-checklist')).toBe(true);

    const folder = researchView!.nodes.find((node) => node.id === D2_FOLDER_ID);
    expect(folder).toBeDefined();
    const folderChildren = folder!.data.children;
    expect(Array.isArray(folderChildren)).toBe(true);
    expect(folderChildren).toHaveLength(5);
    expect(
      (
        folderChildren as Array<{ data: Record<string, unknown>; type: string }>
      ).some(
        (child) =>
          child.type === 'extension' &&
          (child.data.canvasTypeId === CHECKLIST_CANVAS_TYPE_ID ||
            child.data.canvasTypeId === POMODORO_CANVAS_TYPE_ID ||
            child.data.canvasTypeId === REMINDER_CANVAS_TYPE_ID)
      )
    ).toBe(false);
    expect(
      (folderChildren as Array<{ id: string }>).some(
        (child) => child.id === 'd2-legacy-folder-widget'
      )
    ).toBe(true);

    const allNodes = first.views.flatMap((view) => view.nodes);
    const childNodes = allNodes.flatMap((node) =>
      node.type === 'folder' && Array.isArray(node.data.children)
        ? (node.data.children as D2FixtureNode[])
        : []
    );
    const extensionRefs = [...allNodes, ...childNodes]
      .filter((node) => node.type === 'extension')
      .map((node) => node.data.instanceId);
    expect(new Set(extensionRefs)).toEqual(
      new Set(Object.values(D2_INSTANCE_IDS))
    );
    expect(first.links).toHaveLength(2);
    for (const link of first.links) {
      expect(extensionRefs).toContain(link.instanceId);
    }
    for (const productivity of first.productivity) {
      expect(extensionRefs).toContain(productivity.id);
    }

    const detached = researchView!.nodes.find(
      (node) => node.data.noteId === D2_DETACHED_NOTE_ID
    );
    expect(detached?.data.detached).toBe(true);

    for (const attachment of first.attachments) {
      expect(existsSync(join(workspaceRoot, attachment.file))).toBe(true);
    }
    expect(
      existsSync(
        join(
          workspaceRoot,
          '.ghostboard',
          'widgets',
          `${D2_LEGACY_WIDGET_ID}.json`
        )
      )
    ).toBe(true);
    for (const unlinked of first.unlinked) {
      expect(existsSync(join(workspaceRoot, unlinked.file))).toBe(true);
    }
  });

  it('keeps cross-view, Folder, detached, imported and typed records searchable', async () => {
    const fixture = writeD2ProjectFixture(workspaceRoot);

    const sharedResults = await searchWorkspace(workspaceRoot, {
      query: 'd2-shared-evidence',
    });
    const sharedBodyHits = sharedResults.filter(
      (result) => result.matchField === 'body'
    );
    expect(sharedBodyHits).toHaveLength(2);
    expect(sharedBodyHits.map((result) => result.viewId).sort()).toEqual([
      D2_DELIVERY_VIEW_ID,
      D2_RESEARCH_VIEW_ID,
    ]);
    expect(sharedBodyHits.map((result) => result.noteId)).toEqual([
      D2_SHARED_NOTE_ID,
      D2_SHARED_NOTE_ID,
    ]);

    const importedResults = await searchWorkspace(workspaceRoot, {
      query: 'd2-imported-markdown',
    });
    expect(importedResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note',
          nodeId: 'd2-imported-markdown',
          noteId: 'note_d2_imported',
          target: {
            type: 'node',
            viewId: D2_DELIVERY_VIEW_ID,
            nodeId: 'd2-imported-markdown',
            placement: 'top-level',
            content: { kind: 'note', id: 'note_d2_imported' },
          },
        }),
      ])
    );

    const folderReportResults = await searchWorkspace(workspaceRoot, {
      query: 'd2-folder-report',
    });
    expect(folderReportResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'asset',
          nodeId: 'd2-folder-report',
          target: {
            type: 'folder-child',
            viewId: D2_RESEARCH_VIEW_ID,
            folderId: D2_FOLDER_ID,
            childId: 'd2-folder-report',
            placement: 'folder',
            content: { kind: 'extension', id: D2_INSTANCE_IDS.report },
          },
        }),
      ])
    );

    const checklistResults = await searchWorkspace(workspaceRoot, {
      query: 'd2-checklist-capture',
    });
    expect(checklistResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'widget',
          nodeId: 'd2-checklist',
          widgetKind: 'checklist',
          target: {
            type: 'node',
            viewId: D2_RESEARCH_VIEW_ID,
            nodeId: 'd2-checklist',
            placement: 'group',
            content: { kind: 'extension', id: D2_INSTANCE_IDS.checklist },
          },
        }),
      ])
    );

    const detachedResults = await searchWorkspace(workspaceRoot, {
      query: 'd2-detached-field-note',
    });
    expect(detachedResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'd2-detached-note',
          noteId: D2_DETACHED_NOTE_ID,
          target: {
            type: 'node',
            viewId: D2_RESEARCH_VIEW_ID,
            nodeId: 'd2-detached-note',
            placement: 'detached',
            content: { kind: 'note', id: D2_DETACHED_NOTE_ID },
          },
        }),
      ])
    );

    expect(fixture.expected.reusedNoteId).toBe(D2_SHARED_NOTE_ID);
    for (const query of [
      'd2-unlinked-marker-D2 Recoverable Unlinked Note',
      'd2-orphan-widget-marker',
      'd2-orphan-extension-marker',
    ]) {
      await expect(
        searchWorkspace(workspaceRoot, { query })
      ).resolves.toHaveLength(0);
    }
  });
});
