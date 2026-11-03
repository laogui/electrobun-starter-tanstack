#!/usr/bin/env bun
/**
 * T5 packaged acceptance: install the four published example packages from
 * their public HTTPS URLs, take one signed TOFU update through the public
 * release descriptor, exercise each contribution type, restart, and (with
 * --manual-picker) let a person drive the native file picker once for select
 * and once for cancel.
 *
 * Unlike the T3 / T4 runners there is no loopback download server: the app
 * only talks to `--base-url` (default GHOSTBOARD_PLUGIN_EXAMPLES_BASE_URL or
 * https://ghostboard.21blog.com/plugins/examples), the same URLs the docs link.
 *
 * Usage: bun run test:plugin-t5 [--base-url=<https url>] [--manual-picker]
 *        [--skip-build] [--only=install,restart,picker]
 */
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

if (process.platform !== 'darwin') {
  throw new Error(
    'Packaged T5 acceptance requires macOS; Windows / Linux are outside the supported plugin platforms.'
  );
}
if (process.arch !== 'arm64' && process.arch !== 'x64') {
  throw new Error(`Unsupported macOS architecture ${process.arch}`);
}

const project = resolve(import.meta.dir, '../..');
const argument = (name: string) =>
  process.argv
    .find((item) => item.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const manualPicker = process.argv.includes('--manual-picker');
const skipBuild = process.argv.includes('--skip-build');
const only = new Set(
  (argument('only') ?? 'install,restart,picker')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);
const baseUrl = (
  argument('base-url') ??
  process.env.GHOSTBOARD_PLUGIN_EXAMPLES_BASE_URL ??
  'https://ghostboard.21blog.com/plugins/examples'
).replace(/\/+$/, '');
if (!baseUrl.startsWith('https://')) {
  throw new Error('T5 requires a public https:// example base URL');
}
const host = new URL(baseUrl).hostname;
if (
  host === 'localhost' ||
  host.endsWith('.localhost') ||
  /^(127\.|10\.|192\.168\.|0\.0\.0\.0|\[?::1)/.test(host)
) {
  throw new Error('T5 must not use a loopback or private example host');
}

const directory = await mkdtemp(join(tmpdir(), 'ghostboard-plugin-t5-'));
const artifactFolder = 'build/plugin-t5-artifacts';
const buildEnv = {
  ...process.env,
  GHOSTBOARD_ENABLE_PLUGIN_PROBES: '1',
  VITE_PLUGIN_T5: '1',
  VITE_PLUGIN_T4: '0',
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

console.log(`T5 evidence directory: ${directory}`);
console.log(`T5 public example base: ${baseUrl}`);

async function run(
  command: string[],
  name: string,
  cwd = project,
  env = buildEnv
): Promise<void> {
  const logPath = join(directory, name);
  const log = openSync(logPath, 'w');
  try {
    const child = Bun.spawn(command, { cwd, env, stderr: log, stdout: log });
    if ((await child.exited) !== 0) {
      throw new Error(`${command.join(' ')} failed; see ${logPath}`);
    }
  } finally {
    closeSync(log);
  }
}

async function capture(command: string[]): Promise<string> {
  const child = Bun.spawn(command, { stderr: 'pipe', stdout: 'pipe' });
  const text = await new Response(child.stdout).text();
  await child.exited;
  return text.trim();
}

// Rosetta reports a translated process; a native Intel Mac reports 0 (or
// lacks the key entirely). Both cases are recorded verbatim in the evidence.
const translated = await capture([
  'sysctl',
  '-n',
  'sysctl.proc_translated',
]).catch(() => '');
const machine = {
  arch: process.arch,
  hardwareModel: await capture(['sysctl', '-n', 'hw.model']).catch(() => ''),
  macOSVersion: await capture(['sw_vers', '-productVersion']).catch(() => ''),
  nativeCpuBrand: await capture([
    'sysctl',
    '-n',
    'machdep.cpu.brand_string',
  ]).catch(() => ''),
  rosetta: translated === '1',
};

// --- Public inventory -----------------------------------------------------

interface PublishedRelease {
  ghostboard: string;
  sha256: string;
  url: string;
  version: string;
}

interface PublishedIndex {
  baseUrl: string;
  hostRange: string;
  packages: Record<
    string,
    { releases: PublishedRelease[]; releasesUrl: string }
  >;
  publicKey: string;
}

async function fetchPublic(url: string): Promise<Response> {
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`);
  }
  return response;
}

const indexUrl = `${baseUrl}/index.json`;
const publishedIndex = (await (
  await fetchPublic(indexUrl)
).json()) as PublishedIndex;
if (publishedIndex.baseUrl !== baseUrl) {
  throw new Error(
    `${indexUrl} was generated for ${publishedIndex.baseUrl}, not ${baseUrl}`
  );
}

const REQUIRED_EXAMPLES = [
  'example.hello',
  'example.react-hello',
  'example.csv-importer',
  'example.combined',
] as const;

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

interface ExampleSpec {
  id: string;
  installSha256: string;
  installUrl: string;
  installVersion: string;
  releasesUrl: string;
  updateVersion?: string;
}

const downloads: Record<
  string,
  { bytes: number; sha256: string; status: number; url: string }
> = {};
const examples: ExampleSpec[] = [];
for (const id of REQUIRED_EXAMPLES) {
  const entry = publishedIndex.packages[id];
  if (!entry || entry.releases.length === 0) {
    throw new Error(`${indexUrl} does not publish ${id}`);
  }
  const ordered = [...entry.releases].sort((a, b) =>
    compareVersions(a.version, b.version)
  );
  const install = ordered[0]!;
  const latest = ordered.at(-1)!;
  for (const release of ordered) {
    if (!release.url.startsWith(`${baseUrl}/`)) {
      throw new Error(`${id}@${release.version} is hosted outside ${baseUrl}`);
    }
    // Independent download in the runner: proves the CDN serves the bytes the
    // descriptor promises before the app ever asks for them.
    const response = await fetchPublic(release.url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
    downloads[`${id}@${release.version}`] = {
      bytes: bytes.byteLength,
      sha256,
      status: response.status,
      url: release.url,
    };
    if (sha256 !== release.sha256) {
      throw new Error(
        `${release.url} served sha256 ${sha256}, descriptor says ${release.sha256}`
      );
    }
  }
  const descriptor = (await (await fetchPublic(entry.releasesUrl)).json()) as {
    pluginId?: string;
    releases?: PublishedRelease[];
    schema?: string;
  };
  if (
    descriptor.schema !== 'ghostboard-plugin-release/v2' ||
    descriptor.pluginId !== id ||
    (descriptor.releases ?? []).length !== entry.releases.length
  ) {
    throw new Error(`${entry.releasesUrl} does not match ${indexUrl}`);
  }
  examples.push({
    id,
    installSha256: install.sha256,
    installUrl: install.url,
    installVersion: install.version,
    releasesUrl: entry.releasesUrl,
    updateVersion:
      latest.version === install.version ? undefined : latest.version,
  });
}
if (!examples.find((item) => item.id === 'example.hello')?.updateVersion) {
  throw new Error(
    'example.hello must publish at least two versions so the probe can update through the public descriptor'
  );
}
await writeFile(
  join(directory, 'examples.json'),
  `${JSON.stringify(
    {
      baseUrl,
      examples,
      hostRange: publishedIndex.hostRange,
      publicKey: publishedIndex.publicKey,
    },
    null,
    2
  )}\n`
);
console.log(
  `Verified ${Object.keys(downloads).length} public archive(s) against ${indexUrl}`
);

// --- Canary build -----------------------------------------------------------

const archive = join(
  project,
  artifactFolder,
  `canary-macos-${process.arch}-GhostBoard-canary.app.tar.zst`
);
if (skipBuild) {
  if (!existsSync(archive)) {
    throw new Error(`--skip-build requires an existing ${archive}`);
  }
} else {
  await run([process.execPath, 'x', 'vite', 'build'], 'vite.log');
  await run(
    [process.execPath, 'x', 'electrobun', 'build', '--env=canary'],
    'package.log'
  );
}
const archiveSha256 = new Bun.CryptoHasher('sha256')
  .update(await Bun.file(archive).arrayBuffer())
  .digest('hex');
const release = join(directory, 'release');
await mkdir(release);
await run(['tar', '-xf', archive, '-C', release], 'extract.log');
const launcher = join(release, 'GhostBoard-canary.app/Contents/MacOS/launcher');

// --- Phases -----------------------------------------------------------------

const sampleCsv = join(directory, 'manual-picker-sample.csv');
await writeFile(
  sampleCsv,
  'title,text,color\nManual picker,Chosen by a person in the native dialog,green\n'
);

const phases = [
  { name: 'install', picker: 'scripted', timeoutMs: 240_000 },
  { name: 'restart', picker: 'scripted', timeoutMs: 120_000 },
  ...(manualPicker
    ? [{ name: 'picker', picker: 'manual', timeoutMs: 15 * 60_000 }]
    : []),
].filter((phase) => only.has(phase.name));
const results: Record<string, unknown>[] = [];
const pickerLogPath = join(directory, 'picker-log.jsonl');
let pickerLogOffset = 0;

async function relayPickerNotes(): Promise<void> {
  if (!existsSync(pickerLogPath)) {
    return;
  }
  const text = await readFile(pickerLogPath, 'utf8');
  const fresh = text.slice(pickerLogOffset);
  pickerLogOffset = text.length;
  for (const line of fresh.split('\n').filter(Boolean)) {
    try {
      const note = JSON.parse(line) as { message?: string; step?: string };
      console.log(`\n[manual picker · ${note.step ?? 'note'}] ${note.message}`);
      console.log(`  sample file: ${sampleCsv}\n`);
    } catch {
      console.log(line);
    }
  }
}

for (const phase of phases) {
  const resultPath = join(directory, `result-${phase.name}.json`);
  await rm(resultPath, { force: true });
  const logPath = join(directory, `app-${phase.name}.log`);
  const log = openSync(logPath, 'w');
  const child = Bun.spawn([launcher], {
    cwd: dirname(launcher),
    env: {
      ...process.env,
      GHOSTBOARD_PLUGIN_T5_DIR: directory,
      GHOSTBOARD_PLUGIN_T5_PHASE: phase.name,
      GHOSTBOARD_PLUGIN_T5_PICKER: phase.picker,
      GHOSTBOARD_DATA_DIR: join(directory, 'app-data'),
    },
    stderr: log,
    stdout: log,
  });
  try {
    const deadline = Date.now() + phase.timeoutMs;
    while (!existsSync(resultPath)) {
      if (Date.now() > deadline || child.exitCode !== null) {
        throw new Error(`T5 ${phase.name} did not report; see ${logPath}`);
      }
      if (phase.picker === 'manual') {
        await relayPickerNotes();
      }
      await Bun.sleep(100);
    }
    await relayPickerNotes();
    const result = JSON.parse(await readFile(resultPath, 'utf8')) as Record<
      string,
      unknown
    >;
    console.log(JSON.stringify(result, null, 2));
    results.push(result);
    if (result.passed !== true) {
      throw new Error(`T5 ${phase.name} failed; see ${logPath}`);
    }
  } finally {
    child.kill();
    await child.exited;
    closeSync(log);
  }
}

const evidence = {
  archive,
  archiveSha256,
  baseUrl,
  downloads,
  examples,
  indexUrl,
  machine,
  manualPicker,
  notarizationRequested: Boolean(process.env.ELECTROBUN_APPLEID),
  phases: phases.map((phase) => phase.name),
  publicKey: publishedIndex.publicKey,
  results,
  signingRequested: Boolean(process.env.ELECTROBUN_DEVELOPER_ID),
};
await writeFile(
  join(directory, 'package-evidence.json'),
  `${JSON.stringify(evidence, null, 2)}\n`
);
await mkdir(join(project, artifactFolder), { recursive: true });
await writeFile(
  join(project, artifactFolder, `t5-evidence-${process.arch}.json`),
  `${JSON.stringify(evidence, null, 2)}\n`
);
console.log(
  `T5 ${phases.map((phase) => phase.name).join(' + ')} passed on macOS ${process.arch}${machine.rosetta ? ' (Rosetta)' : ''}; evidence in ${artifactFolder}/t5-evidence-${process.arch}.json`
);
