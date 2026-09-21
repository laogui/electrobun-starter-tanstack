import { shallow } from 'zustand/shallow';

/** React Flow positions the wrapper; our node content never reads these coordinates. */
export function nodeRenderPropsEqual<T extends object>(previous: T, next: T) {
  const {
    positionAbsoluteX: _previousX,
    positionAbsoluteY: _previousY,
    ...previousContent
  } = previous as T & {
    positionAbsoluteX?: number;
    positionAbsoluteY?: number;
  };
  const {
    positionAbsoluteX: _nextX,
    positionAbsoluteY: _nextY,
    ...nextContent
  } = next as T & { positionAbsoluteX?: number; positionAbsoluteY?: number };
  return shallow(previousContent, nextContent);
}
