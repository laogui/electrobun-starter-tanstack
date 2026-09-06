import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { NodeHandles } from '@/components/canvas/nodes/_shared/NodeHandles';
import { ResizeHandle } from '@/components/canvas/nodes/_shared/ResizeHandle';
import { NodeTagChips } from '@/components/card/NodeTagChips';
import { useNodeTagEditing } from '@/components/card/useNodeTagEditing';
import { isColorDark } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { RECORDING_CANVAS_TYPE_ID } from '../../shared/extensions/builtinIds';
import { isExtensionInstanceLoadError } from '../../shared/extensions/instance';
import type { ExtensionPresentation } from '../../shared/extensions/presentation';
import type { ExtensionAvailability } from '../../shared/extensions/protocol';

import { ExtensionFallback } from './ExtensionFallback';
import { canvasTypeRegistry } from './registry';
import type { AnyBuiltinCanvasType } from './types';

interface ExtensionErrorBoundaryProps {
  canvasTypeId: string;
  children: ReactNode;
  presentation?: ExtensionPresentation;
}

interface ExtensionErrorBoundaryState {
  crashed: boolean;
}

class ExtensionErrorBoundary extends Component<
  ExtensionErrorBoundaryProps,
  ExtensionErrorBoundaryState
> {
  state: ExtensionErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): ExtensionErrorBoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ExtensionHostShell] Canvas surface crashed', error, info);
  }

  render(): ReactNode {
    if (this.state.crashed) {
      return (
        <ExtensionFallback
          availability="crashed"
          canvasTypeId={this.props.canvasTypeId}
          message="This canvas type crashed. The rest of the board is unaffected."
          presentation={this.props.presentation}
        />
      );
    }
    return this.props.children;
  }
}

function readInstanceFillColor(
  canvasType: AnyBuiltinCanvasType | undefined,
  record: Parameters<typeof isExtensionInstanceLoadError>[0]
): string | undefined {
  const color = canvasType?.interactions?.color;
  if (
    !(
      color &&
      record &&
      !isExtensionInstanceLoadError(record) &&
      canvasType.validateState(record.state)
    )
  ) {
    return;
  }
  return color.get(record.state);
}

function readInstanceTitle(
  record: Parameters<typeof isExtensionInstanceLoadError>[0]
): string {
  if (!record || isExtensionInstanceLoadError(record)) {
    return '';
  }
  const state = record.state;
  if (
    state &&
    typeof state === 'object' &&
    typeof (state as { title?: unknown }).title === 'string'
  ) {
    return (state as { title: string }).title;
  }
  return record.presentation.title ?? '';
}

export function ExtensionHostShell({
  availability,
  canvasTypeId,
  children,
  instanceId,
  maxHeight,
  maxWidth,
  minHeight,
  minWidth,
  nodeId,
  onEnable,
  presentation,
  readOnly,
  resizable,
  selected,
  surface = 'canvas',
}: {
  availability: ExtensionAvailability;
  canvasTypeId: string;
  children: ReactNode;
  instanceId: string;
  maxHeight?: number;
  maxWidth?: number;
  minHeight: number;
  minWidth: number;
  nodeId: string;
  onEnable?: () => void;
  presentation?: ExtensionPresentation;
  readOnly: boolean;
  resizable: boolean;
  selected: boolean;
  /** Canvas node chrome vs focused-view host. Default `canvas`. */
  surface?: 'canvas' | 'detail';
}) {
  const showFallback = availability !== 'available';
  const canvasType = canvasTypeRegistry.get(canvasTypeId);
  const supportsTags = Boolean(canvasType?.interactions?.supportsTags);
  const record = useExtensionInstanceStore((s) => s.records[instanceId]);
  const fillColor = readInstanceFillColor(canvasType, record);
  const isDark = fillColor
    ? isColorDark(fillColor)
    : document.documentElement.classList.contains('dark');
  const isRenaming = useCanvasStore((s) => s.renamingNodeId === nodeId);
  const setRenamingNodeId = useCanvasStore((s) => s.setRenamingNodeId);
  const currentTitle = readInstanceTitle(record);
  const [renameDraft, setRenameDraft] = useState(currentTitle);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const { tag, tagColor, tagColors, tags, dimmedByFilter, tagEditor } =
    useNodeTagEditing(nodeId, {});
  const isDetail = surface === 'detail';
  const showTagChips =
    !isDetail && supportsTags && Boolean(tag || (tags && tags.length > 0));

  useEffect(() => {
    if (!isRenaming) {
      return;
    }
    setRenameDraft(currentTitle);
    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [currentTitle, isRenaming]);

  const commitRename = useCallback(() => {
    const next = renameDraft.trim();
    if (
      next &&
      next !== currentTitle &&
      record &&
      !isExtensionInstanceLoadError(record) &&
      record.state &&
      typeof record.state === 'object'
    ) {
      useExtensionInstanceStore
        .getState()
        .updateState(instanceId, {
          history: 'record',
          state: { ...(record.state as Record<string, unknown>), title: next },
        })
        .catch(() => undefined);
    }
    setRenamingNodeId(null);
  }, [currentTitle, instanceId, record, renameDraft, setRenamingNodeId]);

  const cancelRename = useCallback(() => {
    setRenamingNodeId(null);
  }, [setRenamingNodeId]);

  return (
    <div
      className={cn(
        'group/extension size-full transition-opacity',
        selected ? 'z-10' : undefined,
        supportsTags && !isDetail && dimmedByFilter ? 'opacity-30' : undefined
      )}
      data-extension-instance={instanceId}
    >
      {isDetail || !supportsTags ? null : tagEditor}
      {isDetail ? null : <NodeHandles />}
      <div
        className={
          isDetail
            ? 'relative size-full overflow-hidden'
            : cn(
                'node-visual relative size-full overflow-hidden bg-white shadow-card dark:bg-neutral-900',
                canvasTypeId === RECORDING_CANVAS_TYPE_ID
                  ? 'rounded-2xl'
                  : 'rounded-3xl'
              )
        }
      >
        {showFallback ? (
          <ExtensionFallback
            availability={availability}
            canvasTypeId={canvasTypeId}
            message={
              availability === 'disabled'
                ? 'This canvas type is disabled in the current workspace.'
                : 'This canvas type is from a newer app version. Data is kept.'
            }
            onEnable={onEnable}
            presentation={presentation}
          />
        ) : (
          <ExtensionErrorBoundary
            canvasTypeId={canvasTypeId}
            presentation={presentation}
          >
            {children}
          </ExtensionErrorBoundary>
        )}
        {showTagChips ? (
          <div className="pointer-events-none absolute right-3 bottom-3 left-3 z-10">
            <NodeTagChips
              isDark={isDark}
              tag={tag}
              tagColor={tagColor}
              tagColors={tagColors}
              tags={tags}
            />
          </div>
        ) : null}
        {isRenaming && !(showFallback || isDetail) ? (
          <div
            className="absolute inset-x-4 bottom-14 z-20"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <input
              aria-label="Rename"
              className="nodrag nopan w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-bold text-neutral-900 text-xl shadow-md outline-hidden focus:border-accent dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-50"
              onBlur={commitRename}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitRename();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              ref={renameInputRef}
              type="text"
              value={renameDraft}
            />
          </div>
        ) : null}
      </div>
      {resizable && !readOnly && !isDetail ? (
        <ResizeHandle
          hoverClassName="group-hover/extension:opacity-100"
          maxHeight={maxHeight}
          maxWidth={maxWidth}
          minHeight={minHeight}
          minWidth={minWidth}
          nodeId={nodeId}
        />
      ) : null}
    </div>
  );
}
