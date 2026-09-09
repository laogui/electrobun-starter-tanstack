import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const [target, ...flags] = process.argv.slice(2);
if (!target || flags.some((flag) => flag !== '--react')) {
  throw new Error('Usage: bun run plugin:create <new-directory> [--react]');
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
const template = flags.includes('--react') ? 'react' : 'javascript';
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
    ? 'Run bun install, bun run build, then connect its dist/ directory in GhostBoard Settings → Plugins.'
    : 'Connect this directory in GhostBoard Settings → Plugins. No build or dependency installation is needed.'
);
