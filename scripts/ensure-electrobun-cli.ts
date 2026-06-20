import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  process.exit(0);
}

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const wrapperPath = join(
  projectRoot,
  'node_modules/electrobun/bin/electrobun.cjs'
);
const cliPath = join(projectRoot, 'node_modules/electrobun/bin/electrobun');

if (!existsSync(wrapperPath)) {
  process.exit(0);
}

if (!existsSync(cliPath)) {
  const download = spawnSync(process.execPath, [wrapperPath, '--version'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (download.status !== 0 || !existsSync(cliPath)) {
    console.error(
      '[ensure-electrobun-cli] Failed to download the electrobun CLI binary.'
    );
    process.exit(download.status ?? 1);
  }
}

const codesign = spawnSync('codesign', ['-s', '-', '-f', cliPath], {
  stdio: 'pipe',
  encoding: 'utf8',
});

if (codesign.status !== 0) {
  console.error(
    '[ensure-electrobun-cli] Failed to re-sign electrobun CLI:',
    codesign.stderr || codesign.stdout
  );
  process.exit(codesign.status ?? 1);
}

const verify = spawnSync('codesign', ['--verify', cliPath], {
  stdio: 'pipe',
  encoding: 'utf8',
});

if (verify.status !== 0) {
  console.error(
    '[ensure-electrobun-cli] electrobun CLI signature is still invalid:',
    verify.stderr || verify.stdout
  );
  process.exit(verify.status ?? 1);
}
