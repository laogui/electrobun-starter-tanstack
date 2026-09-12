import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const [target, ...flags] = process.argv.slice(2);
const supportedFlags = ['--combined', '--importer', '--react'];
if (
  !target ||
  flags.some((flag) => !supportedFlags.includes(flag)) ||
  flags.length > 1
) {
  throw new Error(
    'Usage: bun run plugin:create <new-directory> [--react|--importer|--combined]'
  );
}
const directory = resolve(target);
const exists = await stat(directory).then(
  () => true,
  (error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return false;
  }
);
if (exists) {
  throw new Error(`Refusing to overwrite an existing directory: ${directory}`);
}
const template = flags.includes('--react')
  ? 'react'
  : flags.includes('--importer')
    ? 'importer'
    : flags.includes('--combined')
      ? 'combined'
      : 'javascript';
await mkdir(dirname(directory), { recursive: true });
await mkdir(directory);
await cp(
  join(import.meta.dir, 'create-plugin', 'templates', template),
  directory,
  { recursive: true }
);
await cp(
  join(import.meta.dir, '..', 'packages', 'plugin-sdk'),
  join(directory, 'sdk'),
  { recursive: true, filter: (path) => !path.includes('node_modules') }
);
console.log(`Created ${template} plugin in ${directory}`);
console.log(
  template === 'react'
    ? 'Run bun install, bun run build, then connect its dist/ directory in GhostBoard Settings → Plugins. Run bun run package to create an installable archive.'
    : 'Connect this directory in GhostBoard Settings → Plugins. No build is needed; run bun run package to create an installable archive.'
);
