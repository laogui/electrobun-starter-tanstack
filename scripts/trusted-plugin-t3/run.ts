import { closeSync, existsSync, openSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('Packaged T3 acceptance currently requires macOS arm64.');
}

const project = resolve(import.meta.dir, '../..');
const directory = await mkdtemp(join(tmpdir(), 'ghostboard-plugin-t3-'));
const packageDirectory = join(directory, 'package');
const pluginArchive = join(directory, 't3-combined.ghostboard-plugin');
const artifactFolder = 'build/plugin-t3-artifacts';
const buildEnv = {
  ...process.env,
  VITE_PLUGIN_T3: '1',
  VITE_PLUGIN_T2_CONTENT: '0',
  VITE_PLUGIN_T2_A4: '0',
  VITE_PLUGIN_T1: '0',
  VITE_PLUGIN_T0: '0',
  GHOSTBOARD_BUILD_ARTIFACT_DIR: artifactFolder,
};

console.log(`T3 evidence directory: ${directory}`);

async function run(
  command: string[],
  name: string,
  cwd = project,
  env = buildEnv
): Promise<void> {
  const logPath = join(directory, name);
  const log = openSync(logPath, 'w');
  try {
    const child = Bun.spawn(command, {
      cwd,
      env,
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

await mkdir(packageDirectory);
for (const name of ['app.js', 'csv.js', 'manifest.json']) {
  await cp(
    join(import.meta.dir, 'fixture', name),
    join(packageDirectory, name)
  );
}
await run(
  ['zip', '-X', '-q', pluginArchive, 'app.js', 'csv.js', 'manifest.json'],
  'plugin-package.log',
  packageDirectory
);
const pluginEntries = (await Bun.$`unzip -Z1 ${pluginArchive}`.text())
  .trim()
  .split('\n')
  .sort();
if (pluginEntries.join(',') !== 'app.js,csv.js,manifest.json') {
  throw new Error(`Unexpected plugin package: ${pluginEntries.join(', ')}`);
}
const pluginSha256 = new Bun.CryptoHasher('sha256')
  .update(await Bun.file(pluginArchive).arrayBuffer())
  .digest('hex');

const downloadServer = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(request) {
    if (new URL(request.url).pathname !== '/t3-combined.ghostboard-plugin') {
      return new Response('Not found', { status: 404 });
    }
    return new Response(Bun.file(pluginArchive), {
      headers: { 'Content-Type': 'application/zip' },
    });
  },
});
const pluginUrl = `http://127.0.0.1:${downloadServer.port}/t3-combined.ghostboard-plugin`;

try {
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
  const launcher = join(
    release,
    'GhostBoard-canary.app/Contents/MacOS/launcher'
  );
  const results: Record<string, unknown>[] = [];
  for (const phase of ['local', 'restart', 'download'] as const) {
    const logPath = join(directory, `app-${phase}.log`);
    const log = openSync(logPath, 'w');
    const child = Bun.spawn([launcher], {
      cwd: dirname(launcher),
      env: {
        ...process.env,
        GHOSTBOARD_PLUGIN_T3_DIR: directory,
        GHOSTBOARD_PLUGIN_T3_PHASE: phase,
        GHOSTBOARD_PLUGIN_T3_URL: pluginUrl,
        GHOSTBOARD_DATA_DIR: join(
          directory,
          phase === 'download' ? 'download-app-data' : 'local-app-data'
        ),
      },
      stderr: log,
      stdout: log,
    });
    try {
      const resultPath = join(directory, `result-${phase}.json`);
      const deadline = Date.now() + 120_000;
      while (!existsSync(resultPath)) {
        if (Date.now() > deadline || child.exitCode !== null) {
          throw new Error(`T3 ${phase} did not report; see ${logPath}`);
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
        throw new Error(`T3 ${phase} failed; see ${logPath}`);
      }
    } finally {
      child.kill();
      await child.exited;
      closeSync(log);
    }
  }
  await writeFile(
    join(directory, 'package-evidence.json'),
    `${JSON.stringify(
      {
        archive,
        archiveSha256,
        pluginArchive,
        pluginEntries,
        pluginSha256,
        results,
        signingRequested: Boolean(process.env.ELECTROBUN_DEVELOPER_ID),
        notarizationRequested: Boolean(process.env.ELECTROBUN_APPLEID),
      },
      null,
      2
    )}\n`
  );
} finally {
  downloadServer.stop(true);
}
