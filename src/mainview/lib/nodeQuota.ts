import type { Node } from '@xyflow/react';
import { toast } from 'sonner';

import { getCachedLicense, refreshLicense } from '@/lib/rpc-license';
import * as m from '../../paraglide/messages.js';
import { TOPIC_NODE_TYPE } from '../../shared/topic';
import { LICENSE_QUOTA_ENABLED } from './productScope';

/** Free-tier cap shared by create / branch / paste / duplicate / import. */
export const FREE_NODE_LIMIT = 100;

/** React Flow node types that count against the free-tier node limit. Topics
 *  use the same tally as notes and stickies rather than being implicitly
 *  exempt through a missing type check. */
export const COUNTED_NODE_TYPES = new Set<string>([
  'card',
  'sticky',
  TOPIC_NODE_TYPE,
]);

export function countCountedNodes(
  nodes: ReadonlyArray<{ type?: string | undefined }>
): number {
  return nodes.filter((node) => COUNTED_NODE_TYPES.has(node.type ?? '')).length;
}

/**
 * True when adding `additionalCounted` counted nodes stays within the free
 * tier or a license is active.
 *
 * The cached license answers the common case synchronously; only an
 * unactivated cache falls through to a network refresh. Callers must re-read
 * store state after awaiting this — the graph can change while it runs.
 */
export async function hasNodeQuota(
  nodes: Node[],
  additionalCounted = 1
): Promise<boolean> {
  if (!LICENSE_QUOTA_ENABLED) {
    return true;
  }
  if (countCountedNodes(nodes) + additionalCounted <= FREE_NODE_LIMIT) {
    return true;
  }
  try {
    const cached = getCachedLicense();
    const license = cached?.activated ? cached : await refreshLicense();
    if (license && !license.activated) {
      toast.error(m.toast_node_quota(), { duration: 4000 });
      return false;
    }
  } catch (error) {
    // Do not block offline users on a check that could not complete.
    console.error('[License] Check failed:', error);
  }
  return true;
}
