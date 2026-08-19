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

import type {
  BuiltinCanvasType,
  PreviewProps,
  SurfaceProps,
} from '../../types';

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

function RecordingPreviewSurface({
  presentation,
  state,
}: PreviewProps<RecordingState>) {
  const normalized = normalizeRecordingState(state);
  return (
    <div className="flex h-full items-center justify-center p-3 text-sm">
      {presentation.title ||
        normalized.title ||
        `New Recording #${normalized.recordingNumber}`}
    </div>
  );
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
