const EXPORT_ASYNC_FN_RE = /\bexport\s+async\s+function\b/g;
const EXPORT_FN_RE = /\bexport\s+function\b/g;

export function compileHandlerSource(
  source: string,
  exportName: string
): string {
  return `${source
    .replace(EXPORT_ASYNC_FN_RE, 'async function')
    .replace(EXPORT_FN_RE, 'function')}
module.exports = { ${exportName} };
`;
}
