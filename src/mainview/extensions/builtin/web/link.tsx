import { ExternalLink, Link as LinkIcon, RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { LinkContent } from '@/components/canvas/nodes/LinkNode';
import { resolveExtensionMessage } from '@/extensions/messages';
import * as m from '../../../../paraglide/messages.js';
import { LINK_CANVAS_TYPE_ID } from '../../../../shared/extensions/builtinIds';
import {
  buildLinkPresentation,
  createLinkInitialState,
  isLinkState,
  type LinkState,
  normalizeLinkState,
} from '../../../../shared/extensions/web/link';
import {
  type BuiltinCanvasType,
  type CanvasTypeMenuAction,
  colorFieldInteractions,
  type PreviewProps,
  type SurfaceProps,
} from '../../types';

function applyUnfurl(state: LinkState, body: string): LinkState {
  try {
    const result = JSON.parse(body) as {
      description?: string;
      faviconUrl?: string;
      imageUrl?: string;
      siteName?: string;
      status?: string;
      title?: string;
    };
    if (!result || result.status === 'failed') {
      return {
        ...state,
        unfurlStatus: 'failed',
        unfurlError: m.link_preview_failed(),
      };
    }
    return {
      ...state,
      unfurlStatus: 'ready',
      unfurlError: undefined,
      ...(result.title ? { title: result.title } : {}),
      ...(result.description ? { description: result.description } : {}),
      ...(result.siteName ? { siteName: result.siteName } : {}),
      ...(result.imageUrl ? { imageUrl: result.imageUrl } : {}),
      ...(result.faviconUrl ? { faviconUrl: result.faviconUrl } : {}),
    };
  } catch {
    return {
      ...state,
      unfurlStatus: 'failed',
      unfurlError: m.link_preview_failed(),
    };
  }
}

const linkMenuActions: readonly CanvasTypeMenuAction<LinkState>[] = [
  {
    id: 'open-link',
    labelKey: 'menu_open_link',
    icon: ExternalLink,
    visible: (state) => Boolean(state.url),
    run: async ({ host, state }) => {
      if (state.url) {
        await host.external.openUrl(state.url);
      }
    },
  },
  {
    id: 'copy-url',
    labelKey: 'menu_copy_url',
    icon: LinkIcon,
    visible: (state) => Boolean(state.url),
    run: ({ host, state }) => {
      if (!state.url) {
        return;
      }
      navigator.clipboard
        .writeText(state.url)
        .then(() =>
          host.notifications
            .show({
              title: resolveExtensionMessage('toast_copied'),
            })
            .catch(() => undefined)
        )
        .catch(() => undefined);
    },
  },
  {
    id: 'refetch-link',
    labelKey: 'menu_refetch_link',
    icon: RefreshCw,
    visible: (state) => Boolean(state.url),
    run: async ({ host, state }) => {
      await host.instance.updateState({
        history: 'record',
        state: {
          ...state,
          unfurlStatus: 'idle',
          unfurlError: undefined,
        },
      });
    },
  },
  {
    id: 'edit-url',
    labelKey: 'menu_edit_url',
    icon: LinkIcon,
    run: async ({ host }) => {
      await host.canvas.openDetail();
    },
  },
];

function LinkCanvasSurface({ context, host, state }: SurfaceProps<LinkState>) {
  const normalized = normalizeLinkState(state);
  const unfurlAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    if (context.readOnly || !normalized.url) {
      return;
    }
    if (
      normalized.unfurlStatus === 'ready' ||
      normalized.unfurlStatus === 'loading'
    ) {
      return;
    }
    if (unfurlAttemptRef.current === normalized.url) {
      return;
    }
    unfurlAttemptRef.current = normalized.url;
    host.instance
      .updateState({
        history: 'ephemeral',
        state: { ...normalized, unfurlStatus: 'loading' },
      })
      .catch(() => undefined);
    host.network
      .fetch({ url: normalized.url })
      .then((response) =>
        host.instance.updateState({
          history: 'record',
          state: applyUnfurl(normalized, response.body),
        })
      )
      .catch(() => undefined);
  }, [context.readOnly, host, normalized]);

  return (
    <LinkContent
      data={normalized}
      isFocused={context.surface === 'detail'}
      onRetry={() => {
        unfurlAttemptRef.current = null;
        host.instance
          .updateState({
            history: 'record',
            state: { ...normalized, unfurlStatus: 'idle' },
          })
          .catch(() => undefined);
      }}
      onUrlChange={(url) => {
        unfurlAttemptRef.current = null;
        host.instance
          .updateState({
            history: 'record',
            state: { ...normalized, url, unfurlStatus: 'idle' },
          })
          .catch(() => undefined);
      }}
    />
  );
}

function LinkPreviewSurface({ state }: PreviewProps<LinkState>) {
  return <LinkContent allowPlayback={false} data={normalizeLinkState(state)} />;
}

export const linkCanvasType: BuiltinCanvasType<LinkState> = {
  id: LINK_CANVAS_TYPE_ID,
  titleKey: 'canvas_type_web_link',
  descriptionKey: 'canvas_type_web_link_description',
  icon: LinkIcon,
  category: 'web',
  dataVersion: 1,
  createFlow: 'url',
  capabilities: ['network', 'external'],
  interactions: {
    canDetach: true,
    color: colorFieldInteractions<LinkState>(),
    supportsTags: true,
  },
  menuActions: linkMenuActions,
  surface: {
    defaultSize: { width: 380, height: 420 },
    minSize: { width: 320, height: 320 },
    maxSize: { width: 800, height: 600 },
    resizable: true,
    openBehavior: 'detail',
    canEnterGroup: true,
    canEnterFolder: true,
  },
  createInitialState: createLinkInitialState,
  validateState: isLinkState,
  migrateState: (record) => normalizeLinkState(record.state),
  buildPresentation: buildLinkPresentation,
  CanvasSurface: LinkCanvasSurface,
  PreviewSurface: LinkPreviewSurface,
  DetailSurface: LinkCanvasSurface,
};
