import { describe, expect, it } from 'vitest';
import { classifyTypeCheckOutput } from '../../scripts/type-check';

describe('classifyTypeCheckOutput', () => {
  it('ignores Electrobun node_modules diagnostics and keeps project errors', () => {
    const output = [
      "node_modules/electrobun/dist/api/bun/index.ts(32,24): error TS7016: Could not find a declaration file for module 'three'.",
      "src/mainview/routes/index.test.tsx(682,3): error TS2304: Cannot find name 'beforeAll'.",
      "electrobun.config.ts(1,40): error TS2307: Cannot find module 'electrobun'.",
    ].join('\n');

    expect(classifyTypeCheckOutput(output)).toEqual({
      vendorCount: 1,
      projectErrors: [
        "src/mainview/routes/index.test.tsx(682,3): error TS2304: Cannot find name 'beforeAll'.",
        "electrobun.config.ts(1,40): error TS2307: Cannot find module 'electrobun'.",
      ],
    });
  });
});
