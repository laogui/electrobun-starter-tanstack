// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMocks = vi.hoisted(() => ({
  rpcGetSettings: vi.fn(),
  rpcOpenSettings: vi.fn(),
}));
const setThemeMock = vi.fn();
const setLocaleMock = vi.fn();

vi.mock('better-themes', () => ({
  useTheme: () => ({
    setTheme: setThemeMock,
  }),
}));

vi.mock('@/lib/rpc', () => ({
  rpcGetSettings: rpcMocks.rpcGetSettings,
  rpcOpenSettings: rpcMocks.rpcOpenSettings,
}));

vi.mock('../../../src/paraglide/runtime.js', () => ({
  setLocale: setLocaleMock,
}));

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div>Outlet content</div>,
  createRootRouteWithContext:
    () => (options: { component: () => ReactElement }) => ({
      id: 'root-route',
      options,
    }),
}));

vi.mock('@tanstack/react-devtools', () => ({
  TanStackDevtools: () => <div>Devtools</div>,
}));

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtoolsPanel: () => <div>Query Devtools</div>,
}));

vi.mock('@tanstack/react-router-devtools', () => ({
  TanStackRouterDevtoolsPanel: () => <div>Router Devtools</div>,
}));

vi.mock('@tanstack/react-form-devtools', () => ({
  formDevtoolsPlugin: () => ({ name: 'form-devtools' }),
}));

vi.mock('@/components/ui/Toaster', () => ({
  Toaster: () => <div>Toaster</div>,
}));

vi.mock('lucide-react', () => ({
  Settings: () => <svg aria-hidden="true" />,
}));

const loadRootDocument = async () => {
  const module = await import('./__root');
  return module.Route.options.component as () => ReactElement;
};

describe('__root route', () => {
  beforeEach(() => {
    rpcMocks.rpcGetSettings.mockReset();
    rpcMocks.rpcOpenSettings.mockReset();
    setThemeMock.mockReset();
    setLocaleMock.mockReset();
    rpcMocks.rpcGetSettings.mockResolvedValue({ theme: 'dark', locale: 'zh' });
    rpcMocks.rpcOpenSettings.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('loads persisted settings on mount', async () => {
    const RootDocument = await loadRootDocument();
    render(<RootDocument />);

    await waitFor(() => {
      expect(rpcMocks.rpcGetSettings).toHaveBeenCalledTimes(1);
      expect(setThemeMock).toHaveBeenCalledWith('dark');
      expect(setLocaleMock).toHaveBeenCalledWith('zh');
    });
  });

  it('reacts to settings-updated events', async () => {
    const RootDocument = await loadRootDocument();
    render(<RootDocument />);

    globalThis.dispatchEvent(
      new CustomEvent('settings-updated', {
        detail: { theme: 'light', locale: 'en' },
      })
    );

    await waitFor(() => {
      expect(setThemeMock).toHaveBeenCalledWith('light');
      expect(setLocaleMock).toHaveBeenCalledWith('en');
    });
  });

  it('opens the settings window when clicking the settings button', async () => {
    const RootDocument = await loadRootDocument();
    render(<RootDocument />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    await waitFor(() => {
      expect(rpcMocks.rpcOpenSettings).toHaveBeenCalledTimes(1);
    });
  });

  it('removes the event listener on unmount', async () => {
    const removeSpy = vi.spyOn(globalThis, 'removeEventListener');
    const RootDocument = await loadRootDocument();
    const view = render(<RootDocument />);

    view.unmount();

    expect(removeSpy).toHaveBeenCalledWith(
      'settings-updated',
      expect.any(Function)
    );
  });
});
