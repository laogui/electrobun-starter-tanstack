import { type ExtensionPresentation, emptyPresentation } from '../presentation';

export const COUNTER_CANVAS_TYPE_ID = 'ghostboard.demo/counter' as const;

export interface CounterState {
  count: number;
}

export function createCounterInitialState(): CounterState {
  return { count: 0 };
}

export function isCounterState(value: unknown): value is CounterState {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as CounterState).count === 'number' &&
    Number.isFinite((value as CounterState).count)
  );
}

export function buildCounterPresentation(
  state: CounterState
): ExtensionPresentation {
  return {
    ...emptyPresentation('Counter'),
    subtitle: String(state.count),
    plainText: `Count: ${state.count}`,
    accessibilityLabel: `Counter at ${state.count}`,
  };
}
