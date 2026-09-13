import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { GHOSTBOARD_VERSION } from '../../src/shared/plugins/ids';
import {
  hostVersionRangeIncludes,
  isHostVersionRange,
  PLUGIN_MANIFEST_VERSION,
} from '../../src/shared/plugins/manifest';

/**
 * Guards the compatibility policy against drift: every version and host range
 * that the policy, the SDK reference, the SDK README, and the four scaffold
 * templates publish must match the values compiled into the host.
 */
const project = resolve(import.meta.dir, '../..');
const POLICY_PATH =
  'docs/features/In Progress/trusted-plugin-compatibility-policy.md';
const TEMPLATES = ['combined', 'importer', 'javascript', 'react'] as const;

interface PackageJson {
  name: string;
  version: string;
}

interface TemplateManifest {
  engines: { ghostboard: string };
  manifestVersion: number;
}

const failures: string[] = [];

function expect(condition: boolean, message: string) {
  if (!condition) {
    failures.push(message);
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(join(project, path), 'utf8')) as T;
}

const host = await readJson<PackageJson>('package.json');
const sdk = await readJson<PackageJson>('packages/plugin-sdk/package.json');
const scaffold = await readJson<PackageJson>(
  'packages/create-plugin/package.json'
);
expect(
  host.version === GHOSTBOARD_VERSION,
  `GHOSTBOARD_VERSION ${GHOSTBOARD_VERSION} differs from package.json ${host.version}`
);

const ranges = new Set<string>();
for (const template of TEMPLATES) {
  const manifest = await readJson<TemplateManifest>(
    `packages/create-plugin/templates/${template}/manifest.json`
  );
  expect(
    manifest.manifestVersion === PLUGIN_MANIFEST_VERSION,
    `${template} template manifestVersion is ${manifest.manifestVersion}`
  );
  expect(
    isHostVersionRange(manifest.engines.ghostboard),
    `${template} template range ${manifest.engines.ghostboard} is not >=a.b.c <x.y.z`
  );
  expect(
    hostVersionRangeIncludes(manifest.engines.ghostboard, GHOSTBOARD_VERSION),
    `${template} template range ${manifest.engines.ghostboard} excludes host ${GHOSTBOARD_VERSION}`
  );
  ranges.add(manifest.engines.ghostboard);
}
expect(
  ranges.size === 1,
  `templates disagree on engines.ghostboard: ${[...ranges].join(', ')}`
);
const [templateRange = ''] = [...ranges];

const policy = await readFile(join(project, POLICY_PATH), 'utf8');
const policyRows: [label: string, value: string][] = [
  ['宿主版本', host.version],
  ['manifest 版本', String(PLUGIN_MANIFEST_VERSION)],
  ['SDK npm 版本', sdk.version],
  ['脚手架版本', scaffold.version],
  ['模板默认 `engines.ghostboard`', templateRange],
];
for (const [label, value] of policyRows) {
  expect(
    policy.includes(`| ${label} | \`${value}\` |`),
    `${POLICY_PATH} does not list ${label} as ${value}`
  );
}
expect(
  policy.includes(
    `| \`${sdk.version.replace(/\.\d+$/, '.x')}\` | \`${templateRange}\` |`
  ),
  `${POLICY_PATH} SDK ↔ host table does not map SDK ${sdk.version} to ${templateRange}`
);

const reference = await readFile(
  join(project, 'packages/plugin-sdk/AI_REFERENCE.md'),
  'utf8'
);
expect(
  reference.includes('## Compatibility'),
  'AI_REFERENCE.md lacks a Compatibility section'
);
expect(
  reference.includes(
    `Reference version: \`@ghostboard/sdk\` \`${sdk.version}\` for GhostBoard hosts matching\n\`${templateRange}\`.`
  ),
  `AI_REFERENCE.md Compatibility header does not state SDK ${sdk.version} / ${templateRange}`
);
expect(
  reference.includes(`\`create-ghostboard-plugin\` \`${scaffold.version}\``),
  `AI_REFERENCE.md does not state scaffold version ${scaffold.version}`
);

const readme = await readFile(
  join(project, 'packages/plugin-sdk/README.md'),
  'utf8'
);
expect(
  readme.includes(
    `\`@ghostboard/sdk\` \`${sdk.version}\` targets GhostBoard hosts matching \`${templateRange}\``
  ),
  `README.md Compatibility section does not state SDK ${sdk.version} / ${templateRange}`
);
expect(
  readme.includes(`\`create-ghostboard-plugin\` \`${scaffold.version}\``),
  `README.md does not state scaffold version ${scaffold.version}`
);
expect(
  readme.startsWith(`# @ghostboard/sdk ${sdk.version.replace(/\.\d+$/, '')}`),
  `README.md title does not match SDK ${sdk.version}`
);

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      host: host.version,
      manifestVersion: PLUGIN_MANIFEST_VERSION,
      result: 'compatibility policy, SDK reference, README and templates agree',
      scaffold: scaffold.version,
      sdk: sdk.version,
      templateRange,
    },
    null,
    2
  )
);
