import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
  buildPluginPackage,
  generateSigningKey,
} from '../../packages/plugin-sdk/package-plugin.js';

if (
  process.platform !== 'darwin' ||
  (process.arch !== 'arm64' && process.arch !== 'x64')
) {
  throw new Error(
    'Packaged T4 acceptance requires macOS arm64 or x64; other platforms are not supported plugin hosts.'
  );
}

const project = resolve(import.meta.dir, '../..');
const directory = await mkdtemp(join(tmpdir(), 'ghostboard-plugin-t4-'));
const artifactFolder = 'build/plugin-t4-artifacts';
const buildEnv = {
  ...process.env,
  GHOSTBOARD_ENABLE_PLUGIN_PROBES: '1',
  VITE_PLUGIN_T4: '1',
  VITE_PLUGIN_T3: '0',
  VITE_PLUGIN_T2_HISTORY: '0',
  VITE_PLUGIN_T2_CONTENT: '0',
  VITE_PLUGIN_T2_SELECTION: '0',
  VITE_PLUGIN_T2_CANVAS: '0',
  VITE_PLUGIN_T2_A4: '0',
  VITE_PLUGIN_T1: '0',
  VITE_PLUGIN_T0: '0',
  GHOSTBOARD_BUILD_ARTIFACT_DIR: artifactFolder,
};

console.log(`T4 evidence directory: ${directory}`);

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

interface PackageArtifact {
  archive: string;
  bytes: number;
  sha256: string;
  version: string;
}

const primaryKey = await generateSigningKey(join(directory, 'primary-key.pem'));
const changedKey = await generateSigningKey(join(directory, 'changed-key.pem'));
const tlsKey = join(directory, 'tls.key');
const tlsCertificate = join(directory, 'tls.crt');
await run(
  [
    'openssl',
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    tlsKey,
    '-out',
    tlsCertificate,
    '-subj',
    '/CN=127.0.0.1',
    '-days',
    '1',
  ],
  'tls.log'
);

const badDescriptorMarker = join(directory, 't4-bad-descriptor');
const packageByPath = new Map<string, PackageArtifact>();
let updateUrl = '';

const downloadServer = createServer(
  {
    cert: await readFile(tlsCertificate),
    key: await readFile(tlsKey),
  },
  async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', updateUrl).pathname;
      if (pathname === '/releases.json') {
        const bad = existsSync(badDescriptorMarker);
        const selected = bad
          ? packageByPath.get('/t4-v1.2.ghostboard-plugin')
          : packageByPath.get('/t4-v1.1.ghostboard-plugin');
        if (!selected) {
          response.writeHead(503, { 'Content-Type': 'text/plain' });
          response.end('package not ready');
          return;
        }
        const release = {
          ghostboard: '>=1.0.0 <2.0.0',
          notes: bad ? 'Synthetic bad digest' : 'T4 signed update',
          sha256: bad ? '0'.repeat(64) : selected.sha256,
          url: `${updateBaseUrl}${selected.archive.split('/').at(-1)}`,
          version: selected.version,
        };
        const document = {
          channel: 'stable',
          pluginId: 'community.example.t4',
          releases: [release],
          schema: 'ghostboard-plugin-release/v2',
        };
        const body = JSON.stringify(document);
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json; charset=utf-8',
        });
        response.end(body);
        return;
      }
      const packageArtifact = packageByPath.get(pathname);
      if (!packageArtifact) {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('not found');
        return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': packageArtifact.bytes,
        'Content-Type': 'application/zip',
      });
      response.end(await readFile(packageArtifact.archive));
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end(error instanceof Error ? error.message : String(error));
    }
  }
);

await new Promise<void>((resolvePromise, reject) => {
  downloadServer.once('error', reject);
  downloadServer.listen(0, '127.0.0.1', () => resolvePromise());
});
const address = downloadServer.address();
if (!address || typeof address === 'string') {
  throw new Error('T4 update server did not expose a TCP port.');
}
updateUrl = `https://127.0.0.1:${address.port}/releases.json`;
const updateBaseUrl = `https://127.0.0.1:${address.port}/`;

async function buildPackage(
  name: string,
  version: string,
  publicKey: string,
  privateKey: string
): Promise<PackageArtifact> {
  const source = join(directory, `source-${name}`);
  await mkdir(source, { recursive: true });
  await writeFile(
    join(source, 'manifest.json'),
    `${JSON.stringify(
      {
        manifestVersion: 2,
        id: 'community.example.t4',
        name: 'T4 trusted plugin',
        version,
        engines: { ghostboard: '>=1.0.0 <2.0.0' },
        entrypoints: { app: 'app.js' },
        capabilities: [],
        publicKey,
        update: { url: updateUrl },
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    join(source, 'app.js'),
    `import { definePlugin } from '@ghostboard/sdk';\nexport default definePlugin({ setup(app) { app.commands.register({ id: 't4-version', title: 'T4 ${version}', run() {} }); } });\n`
  );
  const archive = join(directory, `t4-${name}.ghostboard-plugin`);
  const built = await buildPluginPackage({
    output: archive,
    privateKey,
    source,
  });
  const result = {
    archive: built.archive,
    bytes: built.bytes,
    sha256: built.sha256,
    version,
  };
  packageByPath.set(`/${archive.split('/').at(-1)}`, result);
  return result;
}

const packages = {
  keyChange: await buildPackage(
    'key-change',
    '1.2.0',
    changedKey.publicKey,
    changedKey.privateKey
  ),
  v1: await buildPackage(
    'v1',
    '1.0.0',
    primaryKey.publicKey,
    primaryKey.privateKey
  ),
  v11: await buildPackage(
    'v1.1',
    '1.1.0',
    primaryKey.publicKey,
    primaryKey.privateKey
  ),
  v12: await buildPackage(
    'v1.2',
    '1.2.0',
    primaryKey.publicKey,
    primaryKey.privateKey
  ),
};

await run([process.execPath, 'x', 'vite', 'build'], 'vite.log');
await run(
  [process.execPath, 'x', 'electrobun', 'build', '--env=canary'],
  'package.log'
);
const archive = join(
  project,
  artifactFolder,
  `canary-macos-${process.arch}-GhostBoard-canary.app.tar.zst`
);
const archiveSha256 = new Bun.CryptoHasher('sha256')
  .update(await Bun.file(archive).arrayBuffer())
  .digest('hex');
const release = join(directory, 'release');
await mkdir(release);
await run(['tar', '-xf', archive, '-C', release], 'extract.log');
const launcher = join(release, 'GhostBoard-canary.app/Contents/MacOS/launcher');

const phases = [
  { data: 'safe-data', name: 'safe-mode', safe: true },
  { data: 'safe-data', name: 'safe-recovery', safe: false },
  { data: 'app-data', name: 'update', safe: false },
  { data: 'app-data', name: 'migration', safe: false },
] as const;
const results: Record<string, unknown>[] = [];
for (const phase of phases) {
  const resultPath = join(directory, `result-${phase.name}.json`);
  await rm(resultPath, { force: true });
  const logPath = join(directory, `app-${phase.name}.log`);
  const log = openSync(logPath, 'w');
  const child = Bun.spawn([launcher], {
    cwd: dirname(launcher),
    env: {
      ...process.env,
      GHOSTBOARD_PLUGIN_T4_DIR: directory,
      GHOSTBOARD_PLUGIN_T4_PHASE: phase.name,
      GHOSTBOARD_DATA_DIR: join(directory, phase.data),
      GHOSTBOARD_SAFE_MODE: phase.safe ? '1' : '0',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
    },
    stderr: log,
    stdout: log,
  });
  try {
    const deadline = Date.now() + 120_000;
    while (!existsSync(resultPath)) {
      if (Date.now() > deadline || child.exitCode !== null) {
        throw new Error(`T4 ${phase.name} did not report; see ${logPath}`);
      }
      await Bun.sleep(100);
    }
    const result = JSON.parse(await readFile(resultPath, 'utf8')) as Record<
      string,
      unknown
    >;
    console.log(JSON.stringify(result, null, 2));
    results.push(result);
    if (result.passed !== true) {
      throw new Error(`T4 ${phase.name} failed; see ${logPath}`);
    }
  } finally {
    child.kill();
    await child.exited;
    closeSync(log);
  }
}

const evidence = {
  arch: process.arch,
  archive,
  archiveSha256,
  packages,
  results,
  signingRequested: Boolean(process.env.ELECTROBUN_DEVELOPER_ID),
  notarizationRequested: Boolean(process.env.ELECTROBUN_APPLEID),
  updateBaseUrl,
};
await writeFile(
  join(directory, 'package-evidence.json'),
  `${JSON.stringify(evidence, null, 2)}\n`
);
await mkdir(join(project, artifactFolder), { recursive: true });
for (const name of ['t4-evidence.json', `t4-evidence-${process.arch}.json`]) {
  await writeFile(
    join(project, artifactFolder, name),
    `${JSON.stringify(evidence, null, 2)}\n`
  );
}
downloadServer.close();
