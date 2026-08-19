import { Link as LinkIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { LinkContent } from '@/components/canvas/nodes/LinkNode';
import { LINK_CANVAS_TYPE_ID } from '../../../../shared/extensions/builtinIds';
import {
  buildLinkPresentation,
  createLinkInitialState,
  isLinkState,
  type LinkState,
  normalizeLinkState,
} from '../../../../shared/extensions/web/link';

import type {
  BuiltinCanvasType,
  PreviewProps,
  SurfaceProps,
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
        unfurlError: 'Could not load link preview.',
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
      unfurlError: 'Could not load link preview.',
    };
  }
}

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
  return <LinkContent data={normalizeLinkState(state)} />;
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
  surface: {
    defaultSize: { width: 380, height: 360 },
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
