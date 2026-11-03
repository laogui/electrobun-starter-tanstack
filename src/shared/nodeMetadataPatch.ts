/** Preserve explicit local deletions across JSON RPC; omitted keys stay omitted. */
export function encodeNodeMetadataPatch<T extends object>(metadata: T) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, value ?? null])
  );
}
