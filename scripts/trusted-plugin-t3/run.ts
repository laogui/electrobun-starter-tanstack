import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { loadPluginFromZip } from '../../src/bun/plugins/zipInstall';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('Packaged T3 acceptance currently requires macOS arm64.');
}

const project = resolve(import.meta.dir, '../..');
const directory = await mkdtemp(join(tmpdir(), 'ghostboard-plugin-t3-'));
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

interface PackageReport {
  archive: string;
  bytes: number;
  entries: string[];
  id: string;
  name: string;
  sha256: string;
}

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

const packageSpecs = [
  {
    entries: ['app.js', 'csv.js', 'manifest.json'],
    id: 't3.combined',
    name: 'combined',
    source: join(import.meta.dir, 'fixture'),
  },
  ...(['command', 'panel', 'canvas', 'importer'] as const).map((name) => ({
    entries:
      name === 'importer'
        ? ['app.js', 'csv.js', 'manifest.json']
        : ['app.js', 'manifest.json'],
    id: `t3.exit.${name}`,
    name,
    source: join(import.meta.dir, 'exit-fixtures', name),
  })),
];
const packageReports: PackageReport[] = [];
for (const spec of packageSpecs) {
  const archive =
    spec.name === 'combined'
      ? pluginArchive
      : join(directory, `t3-exit-${spec.name}.ghostboard-plugin`);
  await run(
    [
      process.execPath,
      join(project, 'packages/plugin-sdk/package-plugin.js'),
      spec.source,
      '--output',
      archive,
      ...spec.entries.flatMap((entry) => ['--include', entry]),
    ],
    `plugin-package-${spec.name}.log`,
    spec.source
  );
  const bytes = new Uint8Array(await readFile(archive));
  const loaded = await loadPluginFromZip(
    bytes,
    join(directory, `plugin-unpacked-${spec.name}`)
  );
  const entries = (await readdir(loaded.directory)).sort();
  if (
    loaded.manifest.id !== spec.id ||
    entries.join(',') !== spec.entries.sort().join(',')
  ) {
    throw new Error(
      `Unexpected ${spec.name} package: ${loaded.manifest.id}; ${entries.join(', ')}`
    );
  }
  packageReports.push({
    archive,
    bytes: bytes.length,
    entries,
    id: spec.id,
    name: spec.name,
    sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
  });
}
const combinedReport = packageReports.find(
  (report) => report.name === 'combined'
)!;
const pluginEntries = combinedReport.entries;
const pluginSha256 = combinedReport.sha256;
const downloads = new Map(
  packageReports.map((report) => [
    `/${report.archive.split('/').at(-1)}`,
    report,
  ])
);

const downloadServer = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(request) {
    const report = downloads.get(new URL(request.url).pathname);
    if (!report) {
      return new Response('Not found', { status: 404 });
    }
    return new Response(Bun.file(report.archive), {
      headers: { 'Content-Type': 'application/zip' },
    });
  },
});
const pluginUrlBase = `http://127.0.0.1:${downloadServer.port}/`;
const pluginUrl = `${pluginUrlBase}t3-combined.ghostboard-plugin`;

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
        GHOSTBOARD_PLUGIN_T3_URL_BASE: pluginUrlBase,
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
        independentPackages: packageReports.filter(
          (report) => report.name !== 'combined'
        ),
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
