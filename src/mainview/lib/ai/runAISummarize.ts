import { toast } from 'sonner';

import {
  buildSelectionContext,
  hasSummarizableSelection,
} from '@/lib/ai/buildAIContext';
import { rpcRunAITask } from '@/lib/rpc';
import { useAIPanelStore } from '@/store/aiPanelStore';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';
import { parseAITaskResult } from '../../../shared/ai/schema';
import type { AITaskErrorCode } from '../../../shared/ai/types';

/**
 * Orchestrates the `summarize_selection` closed loop:
 * selection → context extraction → RPC task → validated result → panel.
 * Apply happens later, explicitly, from the panel (preview → apply → undo).
 */
export async function runAISummarize(): Promise<void> {
  const panel = useAIPanelStore.getState();
  const nodes = useCanvasStore.getState().nodes;

  if (!hasSummarizableSelection(nodes)) {
    toast.info(m.ai_error_empty_selection());
    return;
  }

  panel.openLoading('summarize_selection');
  const context = buildSelectionContext(nodes);

  let response: Awaited<ReturnType<typeof rpcRunAITask>>;
  try {
    response = await rpcRunAITask({
      task: 'summarize_selection',
      context: {
        viewId: useCanvasStore.getState().activeViewId,
        nodes: context,
      },
    });
  } catch (error) {
    console.error('[AI] summarize_selection RPC threw:', error);
    failIfStillLoading('model-error');
    return;
  }

  // The user may have closed the panel or started another task meanwhile.
  const current = useAIPanelStore.getState();
  if (current.status !== 'loading' || current.task !== 'summarize_selection') {
    return;
  }

  if (!response) {
    current.setError('summarize_selection', 'rpc-unavailable');
    return;
  }
  if (!response.success) {
    current.setError(
      'summarize_selection',
      response.error,
      response.errorMessage
    );
    return;
  }

  // Re-validate everything the model returned before it can reach the UI.
  const validated = parseAITaskResult(response.result);
  if (!validated) {
    current.setError('summarize_selection', 'model-error');
    return;
  }

  current.setReady('summarize_selection', validated);
}

function failIfStillLoading(code: AITaskErrorCode): void {
  const current = useAIPanelStore.getState();
  if (current.status === 'loading' && current.task === 'summarize_selection') {
    current.setError('summarize_selection', code);
  }
}
