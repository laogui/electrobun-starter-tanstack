import { Mic } from 'lucide-react';
import { useEffect, useState } from 'react';

import { RecordingContent } from '@/components/canvas/nodes/RecordingNode';
import { RECORDING_CANVAS_TYPE_ID } from '../../../../shared/extensions/builtinIds';
import {
  buildRecordingPresentation,
  createRecordingInitialState,
  isRecordingState,
  normalizeRecordingState,
  type RecordingState,
} from '../../../../shared/extensions/media/state';

import {
  type BuiltinCanvasType,
  colorFieldInteractions,
  type PreviewProps,
  type SurfaceProps,
} from '../../types';
import { recordingMenuActions } from './menuActions';

function RecordingCanvasSurface({ host, state }: SurfaceProps<RecordingState>) {
  const normalized = normalizeRecordingState(state);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!normalized.attachmentFile) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    host.assets
      .getUrl(normalized.attachmentFile)
      .then((url) => {
        if (!cancelled) {
          setSrc(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [host, normalized.attachmentFile]);

  return <RecordingContent data={normalized} streamSrc={src} />;
}

function RecordingPreviewSurface({ state }: PreviewProps<RecordingState>) {
  return <RecordingContent data={normalizeRecordingState(state)} />;
}

export const recordingCanvasType: BuiltinCanvasType<RecordingState> = {
  id: RECORDING_CANVAS_TYPE_ID,
  titleKey: 'canvas_type_media_recording',
  descriptionKey: 'canvas_type_media_recording_description',
  icon: Mic,
  category: 'media',
  dataVersion: 1,
  createFlow: 'recording',
  capabilities: ['assets'],
  interactions: {
    color: colorFieldInteractions<RecordingState>(),
    supportsTags: true,
  },
  menuActions: recordingMenuActions,
  surface: {
    defaultSize: { width: 380, height: 150 },
    minSize: { width: 260, height: 120 },
    maxSize: { width: 800, height: 400 },
    resizable: true,
    openBehavior: 'none',
    canEnterGroup: true,
    canEnterFolder: true,
  },
  createInitialState: () => createRecordingInitialState(),
  validateState: isRecordingState,
  migrateState: (record) => normalizeRecordingState(record.state),
  buildPresentation: buildRecordingPresentation,
  CanvasSurface: RecordingCanvasSurface,
  PreviewSurface: RecordingPreviewSurface,
};
