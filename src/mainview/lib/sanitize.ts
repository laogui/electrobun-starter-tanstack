/**
 * Thin re-export of the canvas node manifest serializers. The implementation
 * lives in `canvasNodeSerialization.ts`; this file exists to avoid churning
 * the dozen existing call sites that import `sanitizeForPersistence`.
 */
export {
  sanitizeForPersistence,
  serializeNodeDataForManifest,
  serializeNodeForManifest,
  stripRuntimeAssetFields,
} from '@/lib/canvasNodeSerialization';
