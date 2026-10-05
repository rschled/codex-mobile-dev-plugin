import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("real server initialization cannot opt into reporting or retain inherited identifiers", async t => {
  const home = await mkdtemp(join(tmpdir(), "mobile-dev-private-home-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const code = `
    import http from "node:http"; import https from "node:https";
    const denied = () => { throw new Error("External reporting attempted"); };
    http.request = denied; https.request = denied; globalThis.fetch = denied;
    await import("./src/server/instrument.ts");
    const Sentry = await import("@sentry/node");
    const { getTelemetryIdentity } = await import("./src/server/telemetry-identity.ts");
    const { NativeTelemetryRelay, nativeCollectorCommand } = await import("./src/server/native-telemetry.ts");
    const relay = new NativeTelemetryRelay(() => {});
    relay.write(Buffer.from("[mobile-dev:sentry-envelope]invalid!\\n")); relay.end();
    Sentry.captureException(new Error("PRIVATE")); await Sentry.flush();
    console.log(JSON.stringify({ client: !!Sentry.getClient(), identity: getTelemetryIdentity(),
      telemetry: process.env.MOBILE_DEV_TELEMETRY, nativeUser: process.env.MOBILE_DEV_NATIVE_USER_ID,
      nativeSession: process.env.MOBILE_DEV_NATIVE_SESSION_ID,
      nativeRelease: process.env.MOBILE_DEV_NATIVE_RELEASE, command: nativeCollectorCommand("/tmp/helper", ["a'b"]) }));
  `;
  const env = { ...process.env, HOME: home, MOBILE_DEV_TELEMETRY: "on",
    MOBILE_DEV_NATIVE_USER_ID: "inherited", MOBILE_DEV_NATIVE_SESSION_ID: "inherited", MOBILE_DEV_NATIVE_RELEASE: "inherited" };
  const result = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", code], { cwd: process.cwd(), env });
  const output = JSON.parse(result.stdout);
  assert.equal(output.client, false); assert.equal(output.identity, undefined);
  assert.equal(output.telemetry, "off"); assert.equal(output.nativeUser, undefined);
  assert.equal(output.nativeSession, undefined); assert.equal(output.nativeRelease, undefined);
  assert.match(output.command, /MOBILE_DEV_TELEMETRY=off/);
  assert.doesNotMatch(output.command, /MOBILE_DEV_NATIVE_(USER|SESSION)_ID/);
  assert.deepEqual(await readdir(home), [], "Startup must not create an ID or telemetry cache.");
});
