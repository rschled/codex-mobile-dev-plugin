# Privacy fork

This fork disables third-party reporting and automatic update checks at runtime.

- The launcher and Node entry point force `MOBILE_DEV_TELEMETRY=off` and remove native reporting identity/configuration. No server Sentry SDK is initialized.
- Browser reporting has been replaced by local state helpers and a React error boundary; the UI imports no reporting SDK. UI CSP permits no external connection domains.
- No anonymous installation ID is created or loaded by the plugin.
- Android collector commands always pass telemetry off. The native report relay never creates a transport or forwards an envelope.
- Update checks return `disabled` without fetching GitHub or reading/writing update state. Update installation is rejected; there is no fetch or CLI upgrade path in the update module.
- Release workflows do not upload source maps or symbols to Sentry.

Device screenshots, accessibility trees, logs, and recordings can still be sent to Codex when you use those tools. Local device and Metro connections remain functional. Your app and Codex have their own network behavior. Explicit manual installation/update and source-build dependency downloads still contact GitHub/npm.

Native binaries are reused from the upstream 0.1.132 release and retain dormant SDK code. The plugin forces their supported opt-out and removes reporting identity; this policy does not cover independently launching those binaries with a custom environment. Some server instrumentation utilities remain for upstream compatibility, but the server initializes no SDK, the UI contains no reporting SDK, and the native relay has no transport.

The bundled Android multipart parser is patched to `@fastify/busboy` 3.2.1, and Agent Device HTTP dependencies are overridden to Undici 7.30.0.
