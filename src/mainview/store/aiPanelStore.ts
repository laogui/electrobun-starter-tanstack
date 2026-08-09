import { create } from 'zustand';

import type {
  AITaskErrorCode,
  AITaskResult,
  AITaskType,
} from '../../shared/ai/types';

/**
 * UI state for the AI task panel (preview → apply → undo). The panel is
 * deliberately global: only one AI task can run at a time, and a new task
 * replaces whatever the panel currently shows.
 */

export type AIPanelStatus = 'closed' | 'loading' | 'ready' | 'error';

interface AIPanelState {
  close: () => void;
  errorCode: AITaskErrorCode | null;
  errorMessage: string | null;
  openLoading: (
    task: AITaskType,
    requestId: number,
    sourceViewId: string
  ) => void;
  requestId: number | null;
  result: AITaskResult | null;
  setError: (
    task: AITaskType,
    requestId: number,
    errorCode: AITaskErrorCode,
    errorMessage?: string
  ) => void;
  setReady: (task: AITaskType, requestId: number, result: AITaskResult) => void;
  sourceViewId: string | null;
  status: AIPanelStatus;
  task: AITaskType | null;
}

export const useAIPanelStore = create<AIPanelState>((set) => ({
  status: 'closed',
  task: null,
  result: null,
  errorCode: null,
  errorMessage: null,
  requestId: null,
  sourceViewId: null,

  openLoading: (task, requestId, sourceViewId) =>
    set({
      status: 'loading',
      task,
      result: null,
      errorCode: null,
      errorMessage: null,
      requestId,
      sourceViewId,
    }),

  setReady: (task, requestId, result) =>
    set((state) =>
      state.task === task && state.requestId === requestId
        ? {
            status: 'ready',
            task,
            result,
            errorCode: null,
            errorMessage: null,
          }
        : state
    ),

  setError: (task, requestId, errorCode, errorMessage) =>
    set((state) =>
      state.task === task && state.requestId === requestId
        ? {
            status: 'error',
            task,
            result: null,
            errorCode,
            errorMessage: errorMessage ?? null,
          }
        : state
    ),

  close: () =>
    set({
      status: 'closed',
      task: null,
      result: null,
      errorCode: null,
      errorMessage: null,
      requestId: null,
      sourceViewId: null,
    }),
}));
