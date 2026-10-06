import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PluginUpdates } from "../src/server/plugin-updates.ts";

test("release builds and explicit opt-in cannot check or install updates", async t => {
  const profile = await mkdtemp(join(tmpdir(), "mobile-dev-private-updates-"));
  t.after(() => rm(profile, { recursive: true, force: true }));
  const previous = process.env.MOBILE_DEV_ENVIRONMENT; process.env.MOBILE_DEV_ENVIRONMENT = "release";
  t.after(() => { if (previous === undefined) delete process.env.MOBILE_DEV_ENVIRONMENT; else process.env.MOBILE_DEV_ENVIRONMENT = previous; });
  const fetch = async () => { assert.fail("Privacy fork must not fetch updates"); };
  const run = async () => { assert.fail("Privacy fork must not run an upgrade"); };
  for (const enabled of [undefined, true, false]) {
    // Deliberately attempt to pass obsolete opt-in settings from the upstream API.
    const options = { profile, enabled, fetch, run };
    const updates = new PluginUpdates(options);
    assert.equal((await updates.check()).status, "disabled");
    await assert.rejects(updates.install(), /privacy fork disables/);
    updates.close();
  }
  assert.deepEqual(await readdir(profile), []);
});
