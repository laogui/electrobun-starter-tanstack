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
  openLoading: (task: AITaskType) => void;
  result: AITaskResult | null;
  setError: (
    task: AITaskType,
    errorCode: AITaskErrorCode,
    errorMessage?: string
  ) => void;
  setReady: (task: AITaskType, result: AITaskResult) => void;
  status: AIPanelStatus;
  task: AITaskType | null;
}

export const useAIPanelStore = create<AIPanelState>((set) => ({
  status: 'closed',
  task: null,
  result: null,
  errorCode: null,
  errorMessage: null,

  openLoading: (task) =>
    set({
      status: 'loading',
      task,
      result: null,
      errorCode: null,
      errorMessage: null,
    }),

  setReady: (task, result) =>
    set({
      status: 'ready',
      task,
      result,
      errorCode: null,
      errorMessage: null,
    }),

  setError: (task, errorCode, errorMessage) =>
    set({
      status: 'error',
      task,
      result: null,
      errorCode,
      errorMessage: errorMessage ?? null,
    }),

  close: () =>
    set({
      status: 'closed',
      task: null,
      result: null,
      errorCode: null,
      errorMessage: null,
    }),
}));
