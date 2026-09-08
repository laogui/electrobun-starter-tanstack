// Serialized into the OS-level WKWebView helper. Experiment only.

export function osWebViewHangPage() {
  (window as unknown as { __STARTED__?: boolean }).__STARTED__ = true;
}

export function osWebViewMemoryPage(config: { allocateBytes: number }) {
  const chunks: Uint8Array[] = [];
  const chunkSize = 1024 * 1024;
  let allocated = 0;
  const target = Math.max(chunkSize, config.allocateBytes);
  try {
    while (allocated < target) {
      const buffer = new Uint8Array(chunkSize);
      buffer.fill(7);
      chunks.push(buffer);
      allocated += chunkSize;
    }
  } catch (error) {
    (window as unknown as { __MEMORY_DONE__?: string }).__MEMORY_DONE__ =
      JSON.stringify({
        allocated,
        chunks: chunks.length,
        error: String(error),
      });
    (window as unknown as { __KEEP_CHUNKS__?: Uint8Array[] }).__KEEP_CHUNKS__ =
      chunks;
    return;
  }
  (window as unknown as { __KEEP_CHUNKS__?: Uint8Array[] }).__KEEP_CHUNKS__ =
    chunks;
  (window as unknown as { __MEMORY_DONE__?: string }).__MEMORY_DONE__ =
    JSON.stringify({
      allocated,
      chunks: chunks.length,
    });
}
