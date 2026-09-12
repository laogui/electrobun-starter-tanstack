import { closeSync, openSync } from 'node:fs';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const project = resolve(import.meta.dir, '../..');
const directory = await mkdtemp(join(tmpdir(), 'ghostboard-plugin-templates-'));

async function run(
  command: string[],
  name: string,
  cwd = project
): Promise<void> {
  const logPath = join(directory, name);
  const log = openSync(logPath, 'w');
  try {
    const child = Bun.spawn(command, {
      cwd,
      stderr: log,
      stdout: log,
    });
    if ((await child.exited) !== 0) {
      throw new Error(`${command.join(' ')} failed; see ${logPath}`);
    }
  } finally {
    closeSync(log);
  }
}

const javascript = join(directory, 'javascript');
await run(
  [process.execPath, 'run', 'plugin:create', javascript],
  'create-javascript.log'
);
await run(
  [process.execPath, 'install', '--ignore-scripts'],
  'install-javascript.log',
  javascript
);
await run([process.execPath, 'test'], 'test-javascript.log', javascript);

const react = join(directory, 'react');
await run(
  [process.execPath, 'run', 'plugin:create', react, '--react'],
  'create-react.log'
);
await run(
  [process.execPath, 'install', '--ignore-scripts'],
  'install-react.log',
  react
);
await run([process.execPath, 'test'], 'test-react.log', react);
await run([process.execPath, 'run', 'type-check'], 'type-react.log', react);
await run([process.execPath, 'run', 'build'], 'build-react.log', react);

const reactRuntimeFiles = (await readdir(join(react, 'dist'))).sort();
if (
  !(
    reactRuntimeFiles.includes('app.js') &&
    reactRuntimeFiles.includes('manifest.json')
  )
) {
  throw new Error(
    `React build is missing runtime files: ${reactRuntimeFiles.join(', ')}`
  );
}

console.log(
  JSON.stringify(
    {
      evidenceDirectory: directory,
      javascriptTest: 'passed',
      reactBuild: reactRuntimeFiles,
      reactTest: 'passed',
      reactTypeCheck: 'passed',
    },
    null,
    2
  )
);
