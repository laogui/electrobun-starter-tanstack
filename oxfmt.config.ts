import { defineConfig } from 'oxfmt';

// 由于 Node.js 硬性限制，node_modules 下的 .ts 文件一律不允许 type stripping
// 这里是基于 ultracite 默认配置内联（node_modules/ultracite/config/oxfmt/index.ts）
// ultracite 升级时需手动对比该文件同步更新，singleQuote/jsxSingleQuote 除外

export default defineConfig({
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  endOfLine: 'lf',
  printWidth: 80,
  quoteProps: 'as-needed',
  semi: true,
  singleQuote: true,
  jsxSingleQuote: true,
  sortImports: {
    ignoreCase: true,
    newlinesBetween: true,
    order: 'asc',
  },
  sortPackageJson: true,
  tabWidth: 2,
  trailingComma: 'es5',
  useTabs: false,
});
