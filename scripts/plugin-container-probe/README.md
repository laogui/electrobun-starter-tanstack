# Plugin container experiment

This standalone Electrobun app exercises native WebKit and, when packaged with `bundleCEF: true`, a CEF Chromium renderer. It is separate from GhostBoard's app and workspace. It creates a temporary sentinel file, a loopback-only HTTP server, disposable same-process windows, and (when launched from a packaged app) child launcher processes. It never loads a user workspace or calls a real GhostBoard service. The only registered RPC canary records that it was called and returns a fixed string. GhostBoard itself remains `bundleCEF: false`.

Run from this directory on macOS with the repository dependencies installed:

```sh
bun ../../node_modules/electrobun/bin/electrobun.cjs build --env=dev
cd build/dev-macos-arm64/GhostBoardPluginProbe-dev.app/Contents/MacOS
./launcher
```

The current launcher expects the bundled entry `bun/index.js`; keep the source entry named `index.ts`. Other target platforms require their own native build/launch and have not been tested.

The launcher prints `PLUGIN_PROBE_RESULT` with a JSON file in a new system temporary directory. Completion means the experiment finished, **not** that a container is safe. Treat a timeout, missing report, any RPC canary call, or a forbidden network request as failed or inconclusive evidence, never a pass.

The experiment compares:

- Native `sandbox: true`: a positive network control with no application RPC facade, plus WebSocket, Worker, storage, and navigation-iframe probes.
- Native `sandbox: true` without registering an application RPC handler: a control for whether removing the facade removes the underlying WebKit message-handler objects.
- The same sandboxed native window containing an `allow-scripts` iframe with CSP: two real handshakes, two forged nonce messages, removal/reopening with host-generated identities, parent DOM/file/fetch/storage probes, and a raw native bridge canary. Old-source rejection is a synthetic call into the message receiver because WebKit rejects detached WindowProxy values in MessageEvent constructors; it is not a real delayed delivery test.
- CEF `renderer: "cef"` with `sandbox: true`, both with and without an application RPC handler, when the probe package includes CEF. The page inspects WebKit handlers, `window.bunBridge`, Chromium host objects, and `cefQuery`, then repeats network/file/storage/WebSocket/Worker/navigation probes and a 20-message canary flood.
- A child process started from the packaged `launcher`: the child creates a sandboxed window without an application RPC schema, reports its launcher/app PIDs through a one-shot local endpoint, and repeats the raw bridge, network, file, opener, parent-window, and storage checks. The probe runs this once for native WebKit and once for CEF when packaged. `status: "completed"` proves a separate process completed the experiment; it does not mean the candidate passed security checks. Source-runtime launches report `status: "unavailable"` because a plain Bun process cannot create an Electrobun window.

The trusted outer page reports to the loopback server. Child results alone are not sufficient evidence; corroborate network access with `networkHits` and native bridge access with `canaryCalls`. The report endpoint and inline source are test instrumentation, not a production plugin protocol.

Run the separate, harmless legacy logic VM canary from the repository root:

```sh
bun scripts/plugin-container-probe/logicProbe.ts
```

It checks whether a host-supplied object's constructor reveals `process`/`Bun` inside the old VM. It does not inspect environment variables, user files, credentials, or network. Any exposed host global rejects that Worker/VM combination for untrusted plugins, even when worker termination works. The old canary is retained as failure evidence; it is no longer the command execution path.

Run the QuickJS WASM boundary canary:

```sh
bun scripts/plugin-container-probe/quickjsProbe.ts
```

It creates a new QuickJS WASM module per invocation, exposes only an explicit JSON host function, and records host-global visibility, strict JSON failures, synchronous and promise timeouts, memory exhaustion, host-call flooding, and fresh-runtime state. A passing logic canary does not prove that an Electrobun WebView is isolated; the native WebKit experiment above remains a separate gate.

Run the macOS-only OS-level WKWebView helper from the repository root:

```sh
bun scripts/plugin-container-probe/osViewProbe.ts
```

It compiles a Swift helper that is not linked to Electrobun, never registers `WKScriptMessageHandler`s, and compares unsandboxed, App Sandbox with `network.client`, App Sandbox without `network.client`, and a `WKContentRuleList` HTTP(S)/WS(S) rule. It additionally checks a host-owned in-memory `ghostboard-plugin:` URL scheme, whose relative CSS and ES modules must load without exposing a filesystem URL. Ground truth is the helper process identity, page-visible bridge objects, custom-resource result, loopback `networkHits`, and a response-free loopback UDP STUN sink. The blocklist candidate sent two WebRTC/STUN UDP packets to that sink despite the HTTP(S)/WS(S) URL rule, so its network verdict is **failed** rather than inconclusive. Even a URL-rule pass is host WebKit policy, not operating-system network denial. Completion means the experiment finished, not that GhostBoard may load untrusted views.

Run the destroy/rebuild and memory canary:

```sh
bun scripts/plugin-container-probe/osViewLifecycleProbe.ts
```

It hangs page JavaScript with `for (;;) {}`, confirms the helper UI heartbeat still advances, destroys the `WKWebView`, and loads a recovery page that repeats the bridge and loopback checks. It then allocates 64MiB in the page, destroys again, and recovers. A second helper is hung and killed with SIGTERM, then replaced by a new process. Helper UI RSS is not WebContent heap size.

Verify the independent sample packages from the repository root:

```sh
bun scripts/plugin-container-probe/outOfRepoSamplesProbe.ts
```

It loads `../ghostboard-plugin-samples` (or `GHOSTBOARD_PLUGIN_SAMPLES`), runs the title-tools command in QuickJS, and opens/reopens the notes panel on a host-issued view session. A pass means the packages do not import the host and do not invent `instanceId`. It does not mean public install is open.

Not covered: IME/focus/clipboard manual checks, per-plugin file/network policy, infinite UI loops, Windows/Linux, or full GhostBoard persistence. The independent launcher canary covers process identity and one window lifecycle only; switching to CEF does not by itself prove a safe plugin container. See the archived experiment under `docs/features/Archive/` before reusing a candidate. These probes served the abandoned sandbox model and are scheduled for removal with the old runtime.
