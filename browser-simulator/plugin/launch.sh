#!/bin/sh
set -eu
for node in "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" /opt/homebrew/bin/node; do
  if [ -x "$node" ]; then exec "$node" ./server.mjs; fi
done
printf '%s\n' 'Install Node.js 22 or later or enable the Codex Node runtime.' >&2
exit 1
