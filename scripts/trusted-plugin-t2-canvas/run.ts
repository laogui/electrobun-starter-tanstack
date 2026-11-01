import { closeSync, existsSync, openSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('Packaged canvas acceptance currently requires macOS arm64.');
}

const project = resolve(import.meta.dir, '../..');
const directory = await mkdtemp(join(tmpdir(), 'ghostboard-plugin-t2-canvas-'));
const artifactFolder = 'build/plugin-t2-canvas-artifacts';
const env = {
  ...process.env,
  GHOSTBOARD_ENABLE_PLUGIN_PROBES: '1',
  VITE_PLUGIN_T2_CANVAS: '1',
  VITE_PLUGIN_T2_CONTENT: '0',
  VITE_PLUGIN_T2_A4: '0',
  VITE_PLUGIN_T1: '0',
  VITE_PLUGIN_T0: '0',
  GHOSTBOARD_BUILD_ARTIFACT_DIR: artifactFolder,
};
console.log(`Canvas evidence directory: ${directory}`);
await cp(join(import.meta.dir, 'fixture'), join(directory, 'fixture'), {
  recursive: true,
});

async function run(command: string[], name: string) {
  const path = join(directory, name);
  const log = openSync(path, 'w');
  try {
    const child = Bun.spawn(command, {
      cwd: project,
      env,
      stdout: log,
      stderr: log,
    });
    if ((await child.exited) !== 0) {
      throw new Error(`${command.join(' ')} failed; see ${path}`);
    }
  } finally {
    closeSync(log);
  }
}

await run([process.execPath, 'x', 'vite', 'build'], 'vite.log');
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
const release = join(directory, 'release');
await mkdir(release);
await run(['tar', '-xf', archive, '-C', release], 'extract.log');
const launcher = join(release, 'GhostBoard-canary.app/Contents/MacOS/launcher');
const results: Record<string, unknown>[] = [];
for (const phase of ['initial', 'restart']) {
  const logPath = join(directory, `app-${phase}.log`);
  const log = openSync(logPath, 'w');
  const child = Bun.spawn([launcher], {
    cwd: dirname(launcher),
    env: {
      ...process.env,
      GHOSTBOARD_PLUGIN_T2_CANVAS_DIR: directory,
      GHOSTBOARD_PLUGIN_T2_CANVAS_PHASE: phase,
      GHOSTBOARD_DATA_DIR: join(directory, 'app-data'),
    },
    stdout: log,
    stderr: log,
  });
  try {
    const resultPath = join(directory, `result-${phase}.json`);
    const deadline = Date.now() + 90_000;
    while (!existsSync(resultPath)) {
      if (Date.now() > deadline || child.exitCode !== null) {
        throw new Error(`Canvas ${phase} did not report; see ${logPath}`);
      }
      await Bun.sleep(100);
    }
    const result = JSON.parse(await readFile(resultPath, 'utf8')) as Record<
      string,
      unknown
    >;
    console.log(JSON.stringify(result, null, 2));
    results.push(result);
    if (!result.passed) {
      throw new Error(`Canvas ${phase} failed; T2 canvas is not accepted.`);
    }
  } finally {
    child.kill();
    await child.exited;
    closeSync(log);
  }
  if (phase === 'initial') {
    await writeFile(
      join(directory, 'fixture', 'version.js'),
      `export const DATA_VERSION = 2;\n\nexport function migrateState(state) {\n  return { ...state, unit: 'points' };\n}\n`
    );
  }
}
await writeFile(
  join(directory, 'package-evidence.json'),
  `${JSON.stringify({ archive, archiveSha256, signingRequested: Boolean(process.env.ELECTROBUN_DEVELOPER_ID), notarizationRequested: Boolean(process.env.ELECTROBUN_APPLEID), results }, null, 2)}\n`
);
