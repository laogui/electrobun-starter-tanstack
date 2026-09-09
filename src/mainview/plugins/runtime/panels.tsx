import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  Disposer,
  PanelDefinition,
} from '../../../../packages/plugin-sdk';

export interface PanelMount {
  dispose: Disposer;
  element: HTMLElement;
}

export type MountPanel = (options: {
  pluginId: string;
  panelId: string;
  title: string;
  close: () => void;
}) => PanelMount;

export function pluginText(english: string, chinese: string): string {
  return typeof document !== 'undefined' &&
    document.documentElement.lang.startsWith('zh')
    ? chinese
    : english;
}

export const mountFloatingPanel: MountPanel = ({
  pluginId,
  panelId,
  title,
  close,
}) => {
  const shell = document.createElement('section');
  shell.dataset.pluginPanel = `${pluginId}/${panelId}`;
  shell.setAttribute('aria-label', title);
  shell.style.cssText =
    'position:fixed;right:16px;bottom:64px;width:min(420px,calc(100vw - 32px));max-height:70vh;overflow:auto;z-index:1000;background:var(--gb-surface);color:var(--gb-foreground);border:1px solid var(--gb-border);border-radius:var(--gb-radius);padding:12px;box-shadow:var(--gb-shadow);font-family:var(--gb-font-sans);';
  const header = document.createElement('header');
  header.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const button = document.createElement('button');
  button.type = 'button';
  button.style.cssText =
    'font:inherit;background:var(--gb-muted);color:var(--gb-foreground);border:1px solid var(--gb-border);border-radius:var(--gb-radius);padding:4px 8px;cursor:pointer;';
  button.textContent = pluginText('Close', '关闭');
  button.addEventListener('click', close);
  header.append(heading, button);
  const element = document.createElement('div');
  shell.append(header, element);
  document.body.append(shell);
  return {
    element,
    dispose: () => {
      button.removeEventListener('click', close);
      shell.remove();
    },
  };
};

class PanelErrorBoundary extends Component<
  { children: ReactNode; report: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.report(
      `${error.name}: ${error.message}\n${error.stack ?? ''}\n${info.componentStack ?? ''}`
    );
  }

  render() {
    if (this.state.failed) {
      return (
        <p role="alert">
          {pluginText(
            'Panel failed. Close and reopen to retry.',
            '面板出错，请关闭后重新打开。'
          )}
        </p>
      );
    }
    return this.props.children;
  }
}

export function renderPanel(
  element: HTMLElement,
  panel: PanelDefinition,
  report: (error: unknown) => void
): Disposer | undefined {
  if (panel.mount) {
    const cleanup = panel.mount(element);
    if (cleanup !== undefined && typeof cleanup !== 'function') {
      throw new Error('Panel mount must return a disposer or undefined');
    }
    return cleanup || undefined;
  }
  const root = createRoot(element, {
    onCaughtError: () => undefined,
    onUncaughtError: report,
    onRecoverableError: report,
  });
  try {
    const View = panel.component;
    root.render(
      <PanelErrorBoundary report={report}>
        <View />
      </PanelErrorBoundary>
    );
  } catch (error) {
    root.unmount();
    throw error;
  }
  return () => root.unmount();
}
