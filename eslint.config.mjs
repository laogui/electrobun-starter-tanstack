// @ts-check
import nirtamir2 from "@nirtamir2/eslint-config";

export default nirtamir2(
  {
    ignores: [""],
    formatters: false,
    react: true,
    jsx: true,
    typescript: {
      tsconfigPath: "./tsconfig.json",
    },
    tailwindcss: {
      entryPoint: "src/mainview/index.css",
    },
    gitignore: true,
    query: true,
  },
  [{ ignores: ["eslint.config.mjs"] }],
  [
    {
      rules: {
        "ssr-friendly/no-dom-globals-in-module-scope": "off",
        "func-style": ["error", "declaration", { allowArrowFunctions: true }],
        "react/no-unknown-property": "off",
        "jsonc/sort-keys": "off",
        "react-refresh/only-export-components": "off",
        "eslint-plugin-sort-destructure-keys-typescript/sort-jsx-attributes-by-type": "off",
      },
    },
  ],
);
