# Project instructions

## Commit messages

Use Conventional Commits for new source commits and pull request titles, for
example `feat(devices): add simulator controls` or `fix(logs): handle disconnects`.
Run `npm ci` to install the commit-message hook. Public releases also validate
the tagged commit's message.

## Privacy policy

Never initialize or enable third-party reporting, create an installation identifier,
permit external UI connections, upload source/symbol artifacts to Sentry, or enable
automatic update requests. Preserve local device/Metro and Codex chat functionality.
Keep native-helper telemetry forced off and the native relay disconnected.
See [docs/privacy-fork.md](docs/privacy-fork.md) and run the privacy regression tests.
