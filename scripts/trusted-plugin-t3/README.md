# T3 combined importer acceptance

`fixture/` is an independently installable manifest-v2 package that registers a command, React panel, canvas type and bounded CSV note importer. The final-user package contains `manifest.json`, `app.js` and `csv.js`; it does not contain the SDK copy, dependencies, tests or package scripts.

The author test uses the copied standalone `@ghostboard/sdk/testing` fake host. It checks parser limits and contribution registration without launching GhostBoard. This does not replace the packaged macOS arm64 ZIP/HTTPS acceptance probe, real native file picker, persistence, transaction recovery, host layout or platform checks.
