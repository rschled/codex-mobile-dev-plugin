import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { loadTelemetryIdentity } from "../src/server/telemetry-identity.ts";
import { isAnonymousUserId, isTelemetrySessionId, validateTelemetryIdentity } from "../src/shared/telemetry-identity.ts";

const execute = promisify(execFile);

test("anonymous identity persists across restarts while server sessions change", async t => {
  const temporary = tmpdir();
  const prefix = join(temporary, "mobile-dev-identity-");
  const root = await mkdtemp(prefix);
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "telemetry");
  const first = loadTelemetryIdentity(directory);
  const second = loadTelemetryIdentity(directory);
  const validUser = isAnonymousUserId(first.userId);
  const validSession = isTelemetrySessionId(first.sessionId);
  assert.equal(validUser, true);
  assert.equal(validSession, true);
  assert.equal(second.userId, first.userId);
  assert.notEqual(second.sessionId, first.sessionId);
  const identityPath = join(directory, "anonymous-user-id");
  const saved = await readFile(identityPath, "utf8");
  assert.equal(saved, `${first.userId}\n`);
  const file = await stat(identityPath);
  const folder = await stat(directory);
  assert.equal(file.mode & 0o777, 0o600);
  assert.equal(folder.mode & 0o777, 0o700);
});

test("concurrent MCP processes publish one complete installation ID", async t => {
  const temporary = tmpdir();
  const prefix = join(temporary, "mobile-dev-identity-race-");
  const root = await mkdtemp(prefix);
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "telemetry");
  const moduleUrl = new URL("../src/server/telemetry-identity.ts", import.meta.url);
  const moduleLiteral = JSON.stringify(moduleUrl.href);
  const code = `import { loadTelemetryIdentity } from ${moduleLiteral}; const identity = loadTelemetryIdentity(process.argv[1]); console.log(JSON.stringify(identity));`;
  const jobs = Array.from({ length: 12 }, () => execute(process.execPath, ["--input-type=module", "-e", code, directory]));
  const results = await Promise.all(jobs);
  const users = new Set<string>();
  const sessions = new Set<string>();
  for (const result of results) {
    const parsed = JSON.parse(result.stdout);
    const identity = validateTelemetryIdentity(parsed.userId, parsed.sessionId);
    users.add(identity.userId);
    sessions.add(identity.sessionId);
  }
  assert.equal(users.size, 1);
  assert.equal(sessions.size, 12);
  const files = await readdir(directory);
  assert.deepEqual(files, ["anonymous-user-id"]);
});

test("invalid stored identifiers fail clearly without silently changing user counts", async t => {
  const temporary = tmpdir();
  const prefix = join(temporary, "mobile-dev-identity-invalid-");
  const directory = await mkdtemp(prefix);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "anonymous-user-id");
  await writeFile(path, "private-account-id");
  assert.throws(() => loadTelemetryIdentity(directory), /stored Sentry anonymous user ID is invalid/);
  const saved = await readFile(path, "utf8");
  assert.equal(saved, "private-account-id");
  assert.throws(() => validateTelemetryIdentity("alice@example.com", "chat-id"), /generated anonymous/);
});
