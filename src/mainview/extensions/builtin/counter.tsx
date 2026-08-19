import { Hash, Minus, Plus } from 'lucide-react';

import {
  buildCounterPresentation,
  COUNTER_CANVAS_TYPE_ID,
  type CounterState,
  createCounterInitialState,
  isCounterState,
} from '../../../shared/extensions/demo/counter';

import type { BuiltinCanvasType, PreviewProps, SurfaceProps } from '../types';

function CounterCanvasSurface({
  context,
  host,
  state,
}: SurfaceProps<CounterState>) {
  const disabled = context.readOnly;

  async function setCount(count: number) {
    if (disabled) {
      return;
    }
    await host.instance.updateState({
      history: 'record',
      state: { count },
    });
  }

  return (
    <div className="nodrag nopan flex h-full flex-col items-center justify-center gap-4 p-6">
      <div className="font-semibold text-neutral-500 text-xs uppercase tracking-wide">
        Counter
      </div>
      <div className="font-semibold text-4xl tabular-nums">{state.count}</div>
      <div className="flex items-center gap-2">
        <button
          className="rounded-full border border-black/10 px-3 py-1 text-sm disabled:opacity-40 dark:border-white/15"
          disabled={disabled}
          onClick={() => {
            setCount(state.count - 1).catch(() => undefined);
          }}
          type="button"
        >
          <Minus size={14} />
        </button>
        <button
          className="rounded-full border border-black/10 px-3 py-1 text-sm disabled:opacity-40 dark:border-white/15"
          disabled={disabled}
          onClick={() => {
            setCount(state.count + 1).catch(() => undefined);
          }}
          type="button"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function CounterPreviewSurface({
  presentation,
  state,
}: PreviewProps<CounterState>) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-3">
      <div className="text-neutral-500 text-xs">
        {presentation.title || 'Counter'}
      </div>
      <div className="font-semibold text-2xl tabular-nums">{state.count}</div>
    </div>
  );
}

export const counterCanvasType: BuiltinCanvasType<CounterState> = {
  id: COUNTER_CANVAS_TYPE_ID,
  titleKey: 'canvas_type_demo_counter',
  descriptionKey: 'canvas_type_demo_counter_description',
  icon: Hash,
  category: 'demo',
  dataVersion: 1,
  surface: {
    defaultSize: { width: 240, height: 200 },
    minSize: { width: 180, height: 160 },
    resizable: true,
    openBehavior: 'none',
    canEnterGroup: true,
    canEnterFolder: false,
  },
  createInitialState: createCounterInitialState,
  validateState: isCounterState,
  migrateState: (record) =>
    isCounterState(record.state) ? record.state : createCounterInitialState(),
  buildPresentation: buildCounterPresentation,
  CanvasSurface: CounterCanvasSurface,
  PreviewSurface: CounterPreviewSurface,
};
