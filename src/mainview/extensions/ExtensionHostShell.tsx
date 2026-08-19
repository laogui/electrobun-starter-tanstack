import { Component, type ErrorInfo, type ReactNode } from 'react';

import { NodeHandles } from '@/components/canvas/nodes/_shared/NodeHandles';
import { ResizeHandle } from '@/components/canvas/nodes/_shared/ResizeHandle';
import { cn } from '@/lib/utils';
import type { ExtensionPresentation } from '../../shared/extensions/presentation';
import type { ExtensionAvailability } from '../../shared/extensions/protocol';

import { ExtensionFallback } from './ExtensionFallback';

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
}) {
  const showFallback = availability !== 'available';

  return (
    <div
      className={cn('group/extension size-full', selected ? 'z-10' : undefined)}
      data-extension-instance={instanceId}
    >
      <NodeHandles />
      <div className="node-visual size-full overflow-hidden rounded-3xl bg-white shadow-card dark:bg-neutral-900">
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
      </div>
      {resizable && !readOnly ? (
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
