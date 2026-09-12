# Hello GhostBoard

No install or build command is needed to run the plugin. In GhostBoard Settings → Plugins, connect this directory, review it, and enable it only after the high-trust confirmation. Open **Open Hello panel** from the plugin menu.

To run the optional author test without launching GhostBoard:

```sh
bun install
bun test
```

The install only links the copied local `sdk/` for the test runner; it is not part of the final-user plugin installation path.

Edit `app.js` and save; the enabled plugin reloads automatically. A failed import or setup leaves the original activation and panel state running unchanged. Candidate registrations are published only after successful setup and old cleanup. `app.generation` counts activation attempts; `app.signal` aborts when its own activation retires or fails, not merely when another candidate starts. Direct DOM, network or file side effects are not transactional. Closing its panel keeps the command available. Disabling the plugin removes its commands and panels. Repeated reloads can retain old ES module closures; reload the app window when needed.

The host import map provides `@ghostboard/sdk`. `manifest.json` must remain v2. `capabilities` are claims, not restrictions. Do not modify DOM outside the panel mount element. API declarations are in `sdk/index.d.ts`; the copy is for author tooling and is not a dependency that the end user's app must install.

`ui.js` contains editable, vendored Button, Input and Surface helpers. These are your source, not shared host components. Copy, modify or replace them; their inline styles use the public `--gb-*` theme tokens and follow light/dark mode without a build or CSS loader. See `sdk/README.md` for the frozen token list. Never import host-private components or theme tokens. No-build JavaScript uses the import map, not the optional bundler-global shim.

`@ghostboard/sdk/testing` is an in-memory fake host for author unit tests. It does not reproduce GhostBoard layout or CSS, persistence, real RPC, multi-plugin arbitration, or platform behavior; use a packaged GhostBoard build for those checks. Signed updates remain a later stage.
