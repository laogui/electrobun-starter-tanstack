import { toast } from 'sonner';

import {
  buildSelectionContext,
  hasSummarizableSelection,
} from '@/lib/ai/buildAIContext';
import { rpcRunAITask } from '@/lib/rpc';
import { useAIPanelStore } from '@/store/aiPanelStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';

import * as m from '../../../paraglide/messages.js';
import { parseAITaskResult } from '../../../shared/ai/schema';
import type { AITaskErrorCode } from '../../../shared/ai/types';

let nextRequestId = 0;

/**
 * Orchestrates the `summarize_selection` closed loop:
 * selection → context extraction → RPC task → validated result → panel.
 * Apply happens later, explicitly, from the panel (preview → apply → undo).
 */
export async function runAISummarize(): Promise<void> {
  const panel = useAIPanelStore.getState();
  const canvas = useCanvasStore.getState();
  const nodes = canvas.nodes;
  const sourceViewId = canvas.activeViewId;
  const extensionInstances = useExtensionInstanceStore.getState().records;

  if (!hasSummarizableSelection(nodes, extensionInstances)) {
    toast.info(m.ai_error_empty_selection());
    return;
  }

  const requestId = ++nextRequestId;
  panel.openLoading('summarize_selection', requestId, sourceViewId);
  const context = buildSelectionContext(nodes, extensionInstances);

  let response: Awaited<ReturnType<typeof rpcRunAITask>>;
  try {
    response = await rpcRunAITask({
      task: 'summarize_selection',
      context: {
        viewId: sourceViewId,
        nodes: context,
      },
    });
  } catch (error) {
    console.error('[AI] summarize_selection RPC threw:', error);
    failIfStillLoading(requestId, sourceViewId, 'model-error');
    return;
  }

  // The user may have closed the panel or started another task meanwhile.
  const current = useAIPanelStore.getState();
  if (
    current.status !== 'loading' ||
    current.task !== 'summarize_selection' ||
    current.requestId !== requestId ||
    current.sourceViewId !== sourceViewId
  ) {
    return;
  }

  if (useCanvasStore.getState().activeViewId !== sourceViewId) {
    current.close();
    return;
  }

  if (!response) {
    current.setError('summarize_selection', requestId, 'rpc-unavailable');
    return;
  }
  if (!response.success) {
    current.setError(
      'summarize_selection',
      requestId,
      response.error,
      response.errorMessage
    );
    return;
  }

  // Re-validate everything the model returned before it can reach the UI.
  const validated = parseAITaskResult(response.result);
  if (!validated || validated.task !== 'summarize_selection') {
    current.setError('summarize_selection', requestId, 'model-error');
    return;
  }

  current.setReady('summarize_selection', requestId, validated);
}

function failIfStillLoading(
  requestId: number,
  sourceViewId: string,
  code: AITaskErrorCode
): void {
  const current = useAIPanelStore.getState();
  if (
    current.status === 'loading' &&
    current.task === 'summarize_selection' &&
    current.requestId === requestId &&
    current.sourceViewId === sourceViewId
  ) {
    if (useCanvasStore.getState().activeViewId !== sourceViewId) {
      current.close();
      return;
    }
    current.setError('summarize_selection', requestId, code);
  }
}
