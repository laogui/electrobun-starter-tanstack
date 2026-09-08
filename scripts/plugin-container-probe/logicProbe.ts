import { runInNewContext } from 'node:vm';

// This is a deliberately separate failure canary for the deleted Worker/VM
// prototype. It never runs through the production QuickJS entry point.
const module = { exports: {} as Record<string, boolean> };
runInNewContext(
  `module.exports = (() => {
    const hostFunction = module.constructor.constructor;
    return {
      hostProcessVisible: hostFunction('return typeof process')() === 'object',
      hostBunVisible: hostFunction('return typeof Bun')() !== 'undefined'
    };
  })();`,
  { module }
);
const result = module.exports;
console.log(
  JSON.stringify(
    {
      date: new Date().toISOString(),
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
      result,
    },
    null,
    2
  )
);
