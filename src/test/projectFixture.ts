import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  CHECKLIST_CANVAS_TYPE_ID,
  FILE_CANVAS_TYPE_ID,
  IMAGE_CANVAS_TYPE_ID,
  LINK_CANVAS_TYPE_ID,
  POMODORO_CANVAS_TYPE_ID,
  RECORDING_CANVAS_TYPE_ID,
  REMINDER_CANVAS_TYPE_ID,
} from '../shared/extensions/builtinIds';
import type { ExtensionPresentation } from '../shared/extensions/presentation';

/**
 * Deterministic project fixture used by the D2-1 flow checks.
 *
 * This module deliberately describes a small, rebuildable workspace instead
 * of embedding a private workspace snapshot. `writeD2ProjectFixture` creates
 * the same files on every run, so the fixture can be used by automated tests
 * and copied into a disposable desktop workspace for manual acceptance.
 */

export const D2_PROJECT_FIXTURE_ID = 'd2-1-synthetic-project';
export const D2_RESEARCH_VIEW_ID = 'd2-research';
export const D2_DELIVERY_VIEW_ID = 'd2-delivery';
export const D2_GROUP_ID = 'd2-research-group';
export const D2_FOLDER_ID = 'd2-evidence-folder';

export const D2_SHARED_NOTE_ID = 'note_d2_shared';
export const D2_RESEARCH_NOTE_ID = 'note_d2_research';
export const D2_DETACHED_NOTE_ID = 'note_d2_detached';
export const D2_IMPORTED_NOTE_ID = 'note_d2_imported';

export const D2_LEGACY_WIDGET_ID = 'widget_d2_legacy';

export const D2_INSTANCE_IDS = {
  checklist: 'extinst_d2_checklist',
  imageA: 'extinst_d2_image_a',
  imageB: 'extinst_d2_image_b',
  linkA: 'extinst_d2_link_a',
  linkB: 'extinst_d2_link_b',
  pomodoro: 'extinst_d2_pomodoro',
  recording: 'extinst_d2_recording',
  reminder: 'extinst_d2_reminder',
  report: 'extinst_d2_report',
} as const;

const FIXTURE_TIMESTAMP = '2026-07-08T00:00:00.000Z';

export type D2FixtureNodeType =
  | 'card'
  | 'extension'
  | 'folder'
  | 'group'
  | 'widget';

export interface D2FixtureNode {
  data: Record<string, unknown>;
  extent?: 'parent';
  id: string;
  noteId?: string;
  parentId?: string;
  position: { x: number; y: number };
  style?: { height: number; width: number };
  type: D2FixtureNodeType;
}

export interface D2FixtureEdge {
  id: string;
  label: string;
  source: string;
  target: string;
}

export interface D2FixtureView {
  edges: D2FixtureEdge[];
  file: string;
  id: string;
  name: string;
  nodes: D2FixtureNode[];
}

export interface D2FixtureNote {
  body: string;
  file: string;
  id: string;
  role: 'detached' | 'imported' | 'folder' | 'shared';
  source: 'markdown' | 'sidecar';
  title: string;
}

export interface D2FixtureAttachment {
  file: string;
  kind: 'audio' | 'image' | 'pdf';
  mimeType: string;
  title: string;
}

export interface D2FixtureLink {
  instanceId: string;
  title: string;
  url: string;
}

export interface D2FixtureProductivityInstance {
  canvasTypeId: string;
  id: string;
  title: string;
}

export interface D2FixtureUnlinkedRecord {
  file: string;
  kind: 'extension' | 'markdown' | 'no-id-markdown' | 'widget';
  noteId?: string;
  title: string;
}

export interface D2ProjectFixture {
  activeViewId: string;
  attachments: D2FixtureAttachment[];
  edges: D2FixtureEdge[];
  expected: {
    attachmentCount: number;
    canvasCount: number;
    distinctNoteCount: number;
    folderChildCount: number;
    productivityCount: number;
    reusedNoteId: string;
    unlinkedCount: number;
  };
  id: string;
  legacyFolderCompatibility: {
    folderId: string;
    nodeId: string;
    widgetId: string;
  };
  links: D2FixtureLink[];
  notes: D2FixtureNote[];
  productivity: D2FixtureProductivityInstance[];
  unlinked: D2FixtureUnlinkedRecord[];
  views: D2FixtureView[];
}

function paragraph(text: string): Record<string, unknown> {
  return {
    children: [],
    content: [{ styles: {}, text, type: 'text' }],
    props: {},
    type: 'paragraph',
  };
}

function noteNode(
  id: string,
  noteId: string,
  file: string,
  title: string,
  position: { x: number; y: number },
  options: { detached?: true; extent?: 'parent'; parentId?: string } = {}
): D2FixtureNode {
  const data = {
    file,
    noteId,
    title,
    type: 'text',
    ...(options.detached ? { detached: true } : {}),
  };
  return {
    data,
    ...(options.extent ? { extent: options.extent } : {}),
    id,
    ...(options.parentId ? { parentId: options.parentId } : {}),
    position,
    type: 'card',
  };
}

function extensionNode(
  id: string,
  instanceId: string,
  canvasTypeId: string,
  position: { x: number; y: number },
  options: { extent?: 'parent'; parentId?: string } = {}
): D2FixtureNode {
  return {
    data: { canvasTypeId, instanceId },
    ...(options.extent ? { extent: options.extent } : {}),
    id,
    ...(options.parentId ? { parentId: options.parentId } : {}),
    position,
    type: 'extension',
  };
}

function folderChild(
  id: string,
  type: D2FixtureNodeType,
  data: Record<string, unknown>,
  noteId?: string
): D2FixtureNode {
  return {
    data,
    id,
    ...(noteId ? { noteId } : {}),
    position: { x: 0, y: 0 },
    type,
  };
}

function presentation(
  title: string,
  subtitle: string,
  plainText: string
): ExtensionPresentation {
  return { plainText, subtitle, title };
}

function instanceRecord(
  id: string,
  canvasTypeId: string,
  state: unknown,
  present: ExtensionPresentation
): Record<string, unknown> {
  return {
    appVersion: '0.1.0-d2-fixture',
    canvasTypeId,
    createdAt: FIXTURE_TIMESTAMP,
    dataVersion: 1,
    id,
    presentation: present,
    revision: 1,
    schema: 'ghostboard-extension-instance/v1',
    state,
    updatedAt: FIXTURE_TIMESTAMP,
  };
}

/** Return a fresh fixture object so tests may safely mutate their copy. */
export function createD2ProjectFixture(): D2ProjectFixture {
  const sharedFile = `content/${D2_SHARED_NOTE_ID}.md`;
  const researchFile = `content/${D2_RESEARCH_NOTE_ID}.md`;
  const detachedFile = `content/${D2_DETACHED_NOTE_ID}.md`;
  const importedFile = 'content/imported/d2-imported.md';

  const folderChildren: D2FixtureNode[] = [
    folderChild(
      'd2-folder-research-note',
      'card',
      {
        file: researchFile,
        noteId: D2_RESEARCH_NOTE_ID,
        title: 'D2 Folder Research Note',
        type: 'text',
      },
      D2_RESEARCH_NOTE_ID
    ),
    folderChild('d2-folder-image', 'extension', {
      canvasTypeId: IMAGE_CANVAS_TYPE_ID,
      instanceId: D2_INSTANCE_IDS.imageB,
    }),
    folderChild('d2-folder-report', 'extension', {
      canvasTypeId: FILE_CANVAS_TYPE_ID,
      instanceId: D2_INSTANCE_IDS.report,
    }),
    folderChild('d2-folder-link', 'extension', {
      canvasTypeId: LINK_CANVAS_TYPE_ID,
      instanceId: D2_INSTANCE_IDS.linkA,
    }),
    // Deliberately legacy: new productivity extension nodes are not allowed
    // in Folder, but this old widget record must remain browsable/searchable.
    folderChild('d2-legacy-folder-widget', 'widget', {
      kind: 'checklist',
      widgetId: D2_LEGACY_WIDGET_ID,
    }),
  ];

  const researchNodes: D2FixtureNode[] = [
    {
      data: { color: 'blue', label: 'D2 research group' },
      id: D2_GROUP_ID,
      position: { x: 80, y: 80 },
      style: { height: 500, width: 760 },
      type: 'group',
    },
    noteNode(
      'd2-shared-research',
      D2_SHARED_NOTE_ID,
      sharedFile,
      'D2 Shared Source Note',
      { x: 120, y: 140 },
      { extent: 'parent', parentId: D2_GROUP_ID }
    ),
    extensionNode(
      'd2-image-a',
      D2_INSTANCE_IDS.imageA,
      IMAGE_CANVAS_TYPE_ID,
      { x: 480, y: 140 },
      { extent: 'parent', parentId: D2_GROUP_ID }
    ),
    extensionNode(
      'd2-checklist',
      D2_INSTANCE_IDS.checklist,
      CHECKLIST_CANVAS_TYPE_ID,
      { x: 120, y: 360 },
      { extent: 'parent', parentId: D2_GROUP_ID }
    ),
    {
      data: {
        children: folderChildren,
        subtitle:
          'Folder accepts cards, media and links; legacy widget retained',
        title: 'D2 Evidence Folder',
      },
      id: D2_FOLDER_ID,
      position: { x: 920, y: 120 },
      style: { height: 420, width: 420 },
      type: 'folder',
    },
    noteNode(
      'd2-detached-note',
      D2_DETACHED_NOTE_ID,
      detachedFile,
      'D2 Detached Field Note',
      { x: 920, y: 620 },
      { detached: true }
    ),
    extensionNode(
      'd2-recording',
      D2_INSTANCE_IDS.recording,
      RECORDING_CANVAS_TYPE_ID,
      { x: 1360, y: 120 }
    ),
  ];

  const deliveryNodes: D2FixtureNode[] = [
    noteNode(
      'd2-shared-delivery',
      D2_SHARED_NOTE_ID,
      sharedFile,
      'D2 Shared Source Note (delivery view)',
      { x: 120, y: 120 }
    ),
    noteNode(
      'd2-imported-markdown',
      D2_IMPORTED_NOTE_ID,
      importedFile,
      'D2 Imported Markdown',
      { x: 520, y: 120 }
    ),
    extensionNode('d2-link-b', D2_INSTANCE_IDS.linkB, LINK_CANVAS_TYPE_ID, {
      x: 920,
      y: 120,
    }),
    extensionNode(
      'd2-pomodoro',
      D2_INSTANCE_IDS.pomodoro,
      POMODORO_CANVAS_TYPE_ID,
      { x: 1360, y: 120 }
    ),
    extensionNode(
      'd2-reminder',
      D2_INSTANCE_IDS.reminder,
      REMINDER_CANVAS_TYPE_ID,
      { x: 1360, y: 480 }
    ),
  ];

  const attachments: D2FixtureAttachment[] = [
    {
      file: 'attachments/d2-diagram-a.png',
      kind: 'image',
      mimeType: 'image/png',
      title: 'D2 Diagram A',
    },
    {
      file: 'attachments/d2-diagram-b.png',
      kind: 'image',
      mimeType: 'image/png',
      title: 'D2 Diagram B',
    },
    {
      file: 'attachments/d2-research-report.pdf',
      kind: 'pdf',
      mimeType: 'application/pdf',
      title: 'D2 Research Report',
    },
    {
      file: 'attachments/d2-field-recording.wav',
      kind: 'audio',
      mimeType: 'audio/wav',
      title: 'D2 Field Recording',
    },
  ];

  const notes: D2FixtureNote[] = [
    {
      body: 'D2 shared evidence marker: d2-shared-evidence. This note is reused across both canvases.',
      file: sharedFile,
      id: D2_SHARED_NOTE_ID,
      role: 'shared',
      source: 'sidecar',
      title: 'D2 Shared Source Note',
    },
    {
      body: 'D2 folder research marker: d2-folder-research. This note starts inside the evidence Folder.',
      file: researchFile,
      id: D2_RESEARCH_NOTE_ID,
      role: 'folder',
      source: 'sidecar',
      title: 'D2 Folder Research Note',
    },
    {
      body: 'D2 detached marker: d2-detached-field-note. This note starts detached from the canvas.',
      file: detachedFile,
      id: D2_DETACHED_NOTE_ID,
      role: 'detached',
      source: 'sidecar',
      title: 'D2 Detached Field Note',
    },
    {
      body: 'D2 imported marker: d2-imported-markdown. Imported Markdown remains readable as a legacy source.',
      file: importedFile,
      id: D2_IMPORTED_NOTE_ID,
      role: 'imported',
      source: 'markdown',
      title: 'D2 Imported Markdown',
    },
  ];

  const links: D2FixtureLink[] = [
    {
      instanceId: D2_INSTANCE_IDS.linkA,
      title: 'D2 Evidence Link',
      url: 'https://example.test/d2/evidence',
    },
    {
      instanceId: D2_INSTANCE_IDS.linkB,
      title: 'D2 Delivery Link',
      url: 'https://example.test/d2/delivery',
    },
  ];

  const productivity: D2FixtureProductivityInstance[] = [
    {
      canvasTypeId: CHECKLIST_CANVAS_TYPE_ID,
      id: D2_INSTANCE_IDS.checklist,
      title: 'D2 Capture Checklist',
    },
    {
      canvasTypeId: POMODORO_CANVAS_TYPE_ID,
      id: D2_INSTANCE_IDS.pomodoro,
      title: 'D2 Focus Timer',
    },
    {
      canvasTypeId: REMINDER_CANVAS_TYPE_ID,
      id: D2_INSTANCE_IDS.reminder,
      title: 'D2 Follow-up Reminder',
    },
  ];

  const unlinked: D2FixtureUnlinkedRecord[] = [
    {
      file: 'content/unlinked/d2-recoverable.md',
      kind: 'markdown',
      noteId: 'note_d2_unlinked',
      title: 'D2 Recoverable Unlinked Note',
    },
    {
      file: 'content/unlinked/d2-no-id.md',
      kind: 'no-id-markdown',
      title: 'D2 Markdown Without Identity',
    },
    {
      file: '.ghostboard/widgets/widget_d2_orphan.json',
      kind: 'widget',
      noteId: 'widget_d2_orphan',
      title: 'D2 Orphan Widget',
    },
    {
      file: '.ghostboard/extension-instances/extinst_d2_orphan.json',
      kind: 'extension',
      noteId: 'extinst_d2_orphan',
      title: 'D2 Orphan Extension',
    },
  ];

  const edges: D2FixtureEdge[] = [
    {
      id: 'd2-research-to-folder',
      label: 'D2 evidence handoff',
      source: D2_GROUP_ID,
      target: D2_FOLDER_ID,
    },
  ];

  return {
    activeViewId: D2_RESEARCH_VIEW_ID,
    attachments,
    edges,
    expected: {
      attachmentCount: attachments.length,
      canvasCount: 2,
      distinctNoteCount: notes.length,
      folderChildCount: folderChildren.length,
      productivityCount: productivity.length,
      reusedNoteId: D2_SHARED_NOTE_ID,
      unlinkedCount: unlinked.length,
    },
    id: D2_PROJECT_FIXTURE_ID,
    legacyFolderCompatibility: {
      folderId: D2_FOLDER_ID,
      nodeId: 'd2-legacy-folder-widget',
      widgetId: D2_LEGACY_WIDGET_ID,
    },
    links,
    notes,
    productivity,
    unlinked,
    views: [
      {
        edges: [edges[0]!],
        file: 'views/d2-research.canvas.json',
        id: D2_RESEARCH_VIEW_ID,
        name: 'D2 Research Canvas',
        nodes: researchNodes,
      },
      {
        edges: [],
        file: 'views/d2-delivery.canvas.json',
        id: D2_DELIVERY_VIEW_ID,
        name: 'D2 Delivery Canvas',
        nodes: deliveryNodes,
      },
    ],
  };
}

function tinyPng(): Uint8Array {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
    0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120,
    156, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0,
    0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);
}

function emptyWav(): Uint8Array {
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, value: string) => {
    for (const [index, char] of [...value].entries()) {
      bytes[offset + index] = char.charCodeAt(0);
    }
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, 0, true);
  return bytes;
}

function minimalPdf(): Uint8Array {
  return new TextEncoder().encode(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
  );
}

function writeJson(wsPath: string, relativeFile: string, value: unknown): void {
  const filePath = join(wsPath, relativeFile);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeNoteSidecar(wsPath: string, note: D2FixtureNote): void {
  writeJson(wsPath, `content/.ghostboard/blocknote/${note.id}.json`, {
    blocks: [paragraph(note.body)],
    color: '#FFFFFF',
    createdAt: FIXTURE_TIMESTAMP,
    displayHint: 'note',
    noteId: note.id,
    revision: 1,
    schema: 'ghostboard-blocknote/v1',
    title: note.title,
    updatedAt: FIXTURE_TIMESTAMP,
  });
}

function writeExtensionInstances(wsPath: string): void {
  writeJson(
    wsPath,
    `.ghostboard/extension-instances/${D2_INSTANCE_IDS.imageA}.json`,
    instanceRecord(
      D2_INSTANCE_IDS.imageA,
      IMAGE_CANVAS_TYPE_ID,
      {
        color: '#FFFFFF',
        imageFile: 'attachments/d2-diagram-a.png',
        title: 'D2 Diagram A',
      },
      presentation('D2 Diagram A', 'image/png', 'd2-image-a')
    )
  );
  writeJson(
    wsPath,
    `.ghostboard/extension-instances/${D2_INSTANCE_IDS.imageB}.json`,
    instanceRecord(
      D2_INSTANCE_IDS.imageB,
      IMAGE_CANVAS_TYPE_ID,
      {
        color: '#FFFFFF',
        imageFile: 'attachments/d2-diagram-b.png',
        title: 'D2 Diagram B',
      },
      presentation('D2 Diagram B', 'image/png', 'd2-image-b')
    )
  );
  writeJson(
    wsPath,
    `.ghostboard/extension-instances/${D2_INSTANCE_IDS.report}.json`,
    instanceRecord(
      D2_INSTANCE_IDS.report,
      FILE_CANVAS_TYPE_ID,
      {
        attachmentFile: 'attachments/d2-research-report.pdf',
        color: '#FFFFFF',
        fileName: 'd2-research-report.pdf',
        kind: 'file',
        mimeType: 'application/pdf',
        title: 'D2 Research Report',
      },
      presentation(
        'D2 Research Report',
        'd2-research-report.pdf',
        'd2-folder-report'
      )
    )
  );
  writeJson(
    wsPath,
    `.ghostboard/extension-instances/${D2_INSTANCE_IDS.recording}.json`,
    instanceRecord(
      D2_INSTANCE_IDS.recording,
      RECORDING_CANVAS_TYPE_ID,
      {
        attachmentFile: 'attachments/d2-field-recording.wav',
        color: '#FFFFFF',
        fileName: 'd2-field-recording.wav',
        mimeType: 'audio/wav',
        recordingNumber: 1,
        title: 'D2 Field Recording',
      },
      presentation('D2 Field Recording', 'd2-field-recording.wav', 'd2-audio')
    )
  );
  writeJson(
    wsPath,
    `.ghostboard/extension-instances/${D2_INSTANCE_IDS.linkA}.json`,
    instanceRecord(
      D2_INSTANCE_IDS.linkA,
      LINK_CANVAS_TYPE_ID,
      {
        color: '#FFFFFF',
        description: 'D2 evidence source link',
        siteName: 'Example Evidence',
        title: 'D2 Evidence Link',
        unfurlStatus: 'ready',
        url: 'https://example.test/d2/evidence',
      },
      presentation(
        'D2 Evidence Link',
        'https://example.test/d2/evidence',
        'd2-link-evidence'
      )
    )
  );
  writeJson(
    wsPath,
    `.ghostboard/extension-instances/${D2_INSTANCE_IDS.linkB}.json`,
    instanceRecord(
      D2_INSTANCE_IDS.linkB,
      LINK_CANVAS_TYPE_ID,
      {
        color: '#FFFFFF',
        description: 'D2 delivery handoff link',
        siteName: 'Example Delivery',
        title: 'D2 Delivery Link',
        unfurlStatus: 'ready',
        url: 'https://example.test/d2/delivery',
      },
      presentation(
        'D2 Delivery Link',
        'https://example.test/d2/delivery',
        'd2-link-delivery'
      )
    )
  );
  writeJson(
    wsPath,
    `.ghostboard/extension-instances/${D2_INSTANCE_IDS.checklist}.json`,
    instanceRecord(
      D2_INSTANCE_IDS.checklist,
      CHECKLIST_CANVAS_TYPE_ID,
      {
        items: [
          {
            checked: false,
            id: 'd2-checklist-item',
            text: 'd2-checklist-capture',
          },
        ],
        title: 'D2 Capture Checklist',
      },
      presentation('D2 Capture Checklist', '1 open', 'd2-checklist-capture')
    )
  );
  writeJson(
    wsPath,
    `.ghostboard/extension-instances/${D2_INSTANCE_IDS.pomodoro}.json`,
    instanceRecord(
      D2_INSTANCE_IDS.pomodoro,
      POMODORO_CANVAS_TYPE_ID,
      {
        completedSessions: 0,
        focusMinutes: 25,
        longBreakMinutes: 15,
        mode: 'focus',
        sessionsBeforeLongBreak: 4,
        shortBreakMinutes: 5,
        timer: { state: 'idle' },
        title: 'D2 Focus Timer',
      },
      presentation('D2 Focus Timer', '0 sessions', 'd2-focus-timer')
    )
  );
  writeJson(
    wsPath,
    `.ghostboard/extension-instances/${D2_INSTANCE_IDS.reminder}.json`,
    instanceRecord(
      D2_INSTANCE_IDS.reminder,
      REMINDER_CANVAS_TYPE_ID,
      {
        dueAt: '2030-01-02T09:00:00.000Z',
        note: 'd2-follow-up-reminder',
        status: 'scheduled',
        timezone: 'Asia/Singapore',
        title: 'D2 Follow-up Reminder',
      },
      presentation(
        'D2 Follow-up Reminder',
        'scheduled',
        'd2-follow-up-reminder'
      )
    )
  );
}

function writeUnlinkedRecords(
  wsPath: string,
  records: D2FixtureUnlinkedRecord[]
): void {
  for (const record of records) {
    if (record.kind === 'markdown' || record.kind === 'no-id-markdown') {
      const frontmatter =
        record.kind === 'markdown'
          ? `---\nid: ${record.noteId}\ntitle: ${record.title}\n---\n`
          : '';
      const filePath = join(wsPath, record.file);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `${frontmatter}d2-unlinked-marker-${record.title}`
      );
      continue;
    }
    if (record.kind === 'widget') {
      writeJson(wsPath, record.file, {
        createdAt: FIXTURE_TIMESTAMP,
        data: {
          items: [
            {
              checked: false,
              id: 'd2-orphan-item',
              text: 'd2-orphan-widget-marker',
            },
          ],
        },
        id: record.noteId,
        kind: 'checklist',
        schema: 'ghostboard-widget/v1',
        title: record.title,
        updatedAt: FIXTURE_TIMESTAMP,
      });
      continue;
    }
    writeJson(wsPath, record.file, {
      appVersion: '0.1.0-d2-fixture',
      canvasTypeId: LINK_CANVAS_TYPE_ID,
      createdAt: FIXTURE_TIMESTAMP,
      dataVersion: 1,
      id: record.noteId,
      presentation: presentation(
        record.title,
        'unlinked',
        'd2-orphan-extension-marker'
      ),
      revision: 1,
      schema: 'ghostboard-extension-instance/v1',
      state: {
        color: '#FFFFFF',
        title: record.title,
        unfurlStatus: 'ready',
        url: 'https://example.test/d2/orphan',
      },
      updatedAt: FIXTURE_TIMESTAMP,
    });
  }
}

/**
 * Write a disposable workspace matching `createD2ProjectFixture`.
 * Existing files with the same fixture paths are intentionally overwritten;
 * callers should pass a temporary or explicitly disposable workspace.
 */
export function writeD2ProjectFixture(wsPath: string): D2ProjectFixture {
  const fixture = createD2ProjectFixture();

  writeJson(wsPath, '.ghostboard/workspace.json', {
    activeViewId: fixture.activeViewId,
    schema: 'ghostboard-workspace/v1',
    views: fixture.views.map((view) => ({
      file: view.file,
      id: view.id,
      name: view.name,
    })),
  });
  for (const view of fixture.views) {
    writeJson(wsPath, `.ghostboard/${view.file}`, {
      edges: view.edges,
      nodes: view.nodes,
      schema: 'ghostboard-canvas/v1',
      viewId: view.id,
    });
  }

  for (const note of fixture.notes) {
    if (note.source === 'sidecar') {
      writeNoteSidecar(wsPath, note);
      continue;
    }
    const filePath = join(wsPath, note.file);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(
      filePath,
      `---\nid: ${note.id}\ntitle: ${note.title}\ndisplayHint: note\n---\n${note.body}`
    );
  }

  const attachmentBytes: Record<D2FixtureAttachment['kind'], Uint8Array> = {
    audio: emptyWav(),
    image: tinyPng(),
    pdf: minimalPdf(),
  };
  for (const attachment of fixture.attachments) {
    const filePath = join(wsPath, attachment.file);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, attachmentBytes[attachment.kind]);
  }

  writeExtensionInstances(wsPath);
  writeJson(wsPath, `.ghostboard/widgets/${D2_LEGACY_WIDGET_ID}.json`, {
    createdAt: FIXTURE_TIMESTAMP,
    data: {
      items: [
        {
          checked: false,
          id: 'd2-legacy-item',
          text: 'd2-legacy-folder-widget-marker',
        },
      ],
    },
    id: D2_LEGACY_WIDGET_ID,
    kind: 'checklist',
    schema: 'ghostboard-widget/v1',
    title: 'D2 Legacy Folder Checklist',
    updatedAt: FIXTURE_TIMESTAMP,
  });
  writeUnlinkedRecords(wsPath, fixture.unlinked);

  return fixture;
}
