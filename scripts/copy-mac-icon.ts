import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.ELECTROBUN_OS !== 'macos') {
  process.exit(0);
}

const buildDir = process.env.ELECTROBUN_BUILD_DIR;
const appName = process.env.ELECTROBUN_APP_NAME;

if (!(buildDir && appName)) {
  throw new Error(
    'Missing ELECTROBUN_BUILD_DIR or ELECTROBUN_APP_NAME for macOS icon copy.'
  );
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourceIcon = join(scriptDir, '..', 'icon.icns');

if (!existsSync(sourceIcon)) {
  throw new Error(`Missing macOS icon source: ${sourceIcon}`);
}

const expectedBundle = join(buildDir, `${appName}.app`);
let appBundle = expectedBundle;

if (!existsSync(appBundle)) {
  const appBundles = readdirSync(buildDir).filter((entry) =>
    entry.endsWith('.app')
  );

  if (appBundles.length !== 1) {
    throw new Error(
      `Could not find a single macOS app bundle in ${buildDir}. Found: ${appBundles.join(', ')}`
    );
  }

  appBundle = join(buildDir, appBundles[0]);
}

const destinationIcon = join(
  appBundle,
  'Contents',
  'Resources',
  'AppIcon.icns'
);

mkdirSync(dirname(destinationIcon), { recursive: true });
copyFileSync(sourceIcon, destinationIcon);
console.log(`Copied macOS icon to ${destinationIcon}`);
