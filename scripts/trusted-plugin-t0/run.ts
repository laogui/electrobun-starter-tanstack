import { closeSync, existsSync, openSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const project = resolve(import.meta.dir, '../..');
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error(
    'T0 runner currently requires macOS arm64. Linux / Windows are not validated.'
  );
}
const directory = await mkdtemp(join(tmpdir(), 'ghostboard-plugin-t0-'));
const artifactFolder = 'build/plugin-t0-artifacts';
const env = {
  ...process.env,
  VITE_PLUGIN_T0: '1',
  GHOSTBOARD_BUILD_ARTIFACT_DIR: artifactFolder,
};

async function run(command: string[], logName: string) {
  const logPath = join(directory, logName);
  const log = openSync(logPath, 'w');
  try {
    const child = Bun.spawn(command, {
      cwd: project,
      env,
      stdout: log,
      stderr: log,
    });
    if ((await child.exited) !== 0) {
      throw new Error(`${command.join(' ')} failed; see ${logPath}`);
    }
  } finally {
    closeSync(log);
  }
}

console.log(`T0 evidence directory: ${directory}`);
await cp(join(import.meta.dir, 'fixtures'), directory, { recursive: true });
const workspace = join(directory, 'app-data', 'workspace');
const oldRoot = join(workspace, '.ghostboard', 'plugins');
const legacyDirectory = join(
  oldRoot,
  'packages',
  't0.legacy',
  '0.1.0',
  'a'.repeat(64)
);
await mkdir(legacyDirectory, { recursive: true });
await writeFile(
  join(legacyDirectory, 'ghostboard.plugin.json'),
  JSON.stringify({ manifestVersion: 1, id: 't0.legacy' })
);
await writeFile(join(legacyDirectory, 'user-data.json'), '{"keep":true}\n');
await writeFile(
  join(workspace, 'legacy-canvas-content.json'),
  '{"plugin":"t0.legacy","keep":true}\n'
);
await writeFile(
  join(oldRoot, 'registry.json'),
  JSON.stringify({
    schema: 1,
    packages: [
      {
        pluginId: 't0.legacy',
        name: 'Legacy T0 fixture',
        version: '0.1.0',
        digest: 'a'.repeat(64),
        directory: legacyDirectory,
        installedAt: new Date().toISOString(),
        source: { kind: 'zip' },
      },
    ],
  })
);
await run([process.execPath, 'x', 'vite', 'build'], 'vite.log');
const html = await readFile(join(project, 'dist/index.html'), 'utf8');
if (
  html.indexOf('type="importmap"') < 0 ||
  html.indexOf('type="importmap"') > html.indexOf('type="module"')
) {
  throw new Error('Import map must precede every module');
}
const shared = [
  'host-react',
  'host-react-dom',
  'host-react-dom-client',
  'host-jsx-runtime',
  'host-react-runtime',
  'host-sdk',
  'host-sdk-react',
];
for (const name of shared) {
  await readFile(join(project, 'dist/assets', `${name}.js`));
}
await writeFile(join(directory, 'index.html'), html);
await run(
  [process.execPath, 'x', 'electrobun', 'build', '--env=canary'],
  'package.log'
);
const archive = join(
  project,
  artifactFolder,
  'canary-macos-arm64-GhostBoard-canary.app.tar.zst'
);
const archiveSha256 = new Bun.CryptoHasher('sha256')
  .update(await Bun.file(archive).arrayBuffer())
  .digest('hex');
const unpack = join(directory, 'release');
await mkdir(unpack);
await run(['tar', '-xf', archive, '-C', unpack], 'extract.log');
const app = join(unpack, 'GhostBoard-canary.app');
const launcher = join(app, 'Contents/MacOS/launcher');
await readFile(launcher);
const logPath = join(directory, 'app.log');
const log = openSync(logPath, 'w');
const child = Bun.spawn([launcher], {
  cwd: dirname(launcher),
  env: {
    ...process.env,
    GHOSTBOARD_PLUGIN_T0_DIR: directory,
    GHOSTBOARD_DATA_DIR: join(directory, 'app-data'),
  },
  stdout: log,
  stderr: log,
});
try {
  const deadline = Date.now() + 90_000;
  const resultPath = join(directory, 'result.json');
  // BunFile caches a missing-file stat; creating one before the report arrives never observes the write.
  while (!existsSync(resultPath)) {
    if (Date.now() > deadline || child.exitCode !== null) {
      throw new Error(`Packaged T0 did not report; inspect ${logPath}`);
    }
    await Bun.sleep(250);
  }
  const report = JSON.parse(await readFile(resultPath, 'utf8'));
  await writeFile(
    join(directory, 'package-evidence.json'),
    `${JSON.stringify({ archiveSha256, archive, app, sharedModules: shared, importMapBeforeModules: true, signingRequested: Boolean(process.env.ELECTROBUN_DEVELOPER_ID), notarizationRequested: Boolean(process.env.ELECTROBUN_APPLEID), result: report }, null, 2)}\n`
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) {
    throw new Error('T0 failed. Stop before T1 and revise design §12.');
  }
} finally {
  child.kill();
  await child.exited;
  closeSync(log);
}
