import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ERROR_LINE_RE = /^(.*)\(\d+,\d+\): error TS\d+:/;
const NODE_MODULES_RE = /node_modules[/\\]/;

export function classifyTypeCheckOutput(output: string): {
  projectErrors: string[];
  vendorCount: number;
} {
  const projectErrors: string[] = [];
  let vendorCount = 0;

  for (const line of output.split('\n')) {
    const match = ERROR_LINE_RE.exec(line);
    if (!match) {
      continue;
    }

    const filePath = match[1] ?? '';
    if (NODE_MODULES_RE.test(filePath)) {
      vendorCount += 1;
      continue;
    }

    projectErrors.push(line);
  }

  return { projectErrors, vendorCount };
}

function run(): void {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const tsgoBin = join(projectRoot, 'node_modules', '.bin', 'tsgo');

  const result = spawnSync(tsgoBin, ['--noEmit', '--pretty', 'false'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  if (result.error) {
    console.error('[type-check] Failed to start tsgo:', result.error.message);
    process.exit(1);
  }

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const { projectErrors, vendorCount } = classifyTypeCheckOutput(output);

  if (vendorCount > 0) {
    console.error(
      `[type-check] Ignored ${vendorCount} diagnostic(s) in node_modules. Electrobun exports .ts sources, so skipLibCheck does not apply.`
    );
  }

  if (projectErrors.length > 0) {
    console.error(projectErrors.join('\n'));
    process.exit(1);
  }

  if (result.status !== 0 && vendorCount === 0) {
    if (output.trim().length > 0) {
      console.error(output);
    } else {
      console.error(`[type-check] tsgo exited with status ${result.status}`);
    }
    process.exit(result.status ?? 1);
  }

  process.exit(0);
}

if (import.meta.main) {
  run();
}
