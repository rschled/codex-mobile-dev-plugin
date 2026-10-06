#!/bin/sh
set -eu

# Privacy policy is fixed for this fork, not a user-overridable default.
export MOBILE_DEV_TELEMETRY=off
unset MOBILE_DEV_NATIVE_USER_ID MOBILE_DEV_NATIVE_SESSION_ID
unset MOBILE_DEV_NATIVE_RELEASE MOBILE_DEV_NATIVE_ENVIRONMENT MOBILE_DEV_NATIVE_CACHE

exec "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" "$@"
