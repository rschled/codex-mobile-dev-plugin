import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { access } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { z } from 'zod';
import { inputSchema, touchInputSchema, udidSchema } from '../src/shared/protocol.ts';
import { baguetteEnvironment } from '../src/server/baguette-runtime.ts';

const execute = promisify(execFile);
const xcrun = '/usr/bin/xcrun';
const inputOwner = 'com.apple.coredevice.dtuhidd.active';
export const actionSchema = z.discriminatedUnion('type', inputSchema.options.filter(option => option !== touchInputSchema));

async function mappedSimulator(checkout) {
  if (!isAbsolute(checkout)) throw new Error('Use the absolute path to the Dapital iOS checkout.');
  const candidates = [join(checkout, 'dappios'), checkout];
  let ios;
  for (const candidate of candidates) {
    try { await access(join(candidate, 'hbay/simulator-checkout-mapping.json')); ios = candidate; break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!ios) throw new Error('Use the Dapital client checkout or its dappios directory.');
  const { stdout } = await execute('/usr/bin/python3', [join(ios, 'scripts/agent-ios.py'), 'resolve'], {
    cwd: ios, timeout: 15000,
  });
  return JSON.parse(stdout).simulator;
}

async function namedSimulator(name) {
  const { stdout } = await execute(xcrun, ['simctl', 'list', 'devices', 'available', '-j'], { timeout: 15000 });
  const devices = Object.entries(JSON.parse(stdout).devices)
    .filter(([runtime]) => runtime.startsWith('com.apple.CoreSimulator.SimRuntime.iOS-'))
    .flatMap(([, devices]) => devices);
  const matches = devices.filter(device => device.name === name && device.isAvailable !== false);
  if (matches.length !== 1) {
    throw new Error(matches.length ? `More than one iOS simulator is named ${name}.` : `No available iOS simulator is named ${name}.`);
  }
  return matches[0];
}

export async function resolveSimulator(checkout, simulatorName) {
  const simulator = simulatorName === undefined ? await mappedSimulator(checkout) : await namedSimulator(simulatorName);
  udidSchema.parse(simulator.udid);
  if (simulator.state === 'Shutdown') await execute(xcrun, ['simctl', 'boot', simulator.udid], { timeout: 30000 });
  if (simulator.state !== 'Booted') await execute(xcrun, ['simctl', 'bootstatus', simulator.udid, '-b'], { timeout: 120000 });
  return simulator;
}

export async function simulatorNative(executable, udid) {
  await access(executable);
  const env = await baguetteEnvironment(executable, AbortSignal.timeout(8000));
  env.MOBILE_DEV_TELEMETRY = 'off';
  for (const name of ['USER_ID', 'SESSION_ID', 'RELEASE', 'ENVIRONMENT', 'CACHE']) delete env[`MOBILE_DEV_NATIVE_${name}`];
  const argsFor = (command, args) => [command, '--udid', udid, ...args];
  const run = (command, args = [], options = {}) => execute(executable, argsFor(command, args), {
    env, timeout: 15000, maxBuffer: 8 * 1024 * 1024, ...options,
  });
  const start = (command, args = []) => {
    const child = spawn(executable, argsFor(command, args), { env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stderr.resume();
    return child;
  };
  const readOwner = async () => {
    const { stdout } = await execute(xcrun, ['simctl', 'spawn', udid, 'notifyutil', '-g', inputOwner], { timeout: 5000 });
    return stdout.trim().split(/\s+/).at(-1);
  };
  const checkOwner = async () => {
    if (await readOwner() === '1') {
      throw new Error('Device Hub owns input. Close its window for this simulator, then reclaim input.');
    }
  };
  let input;
  let queue = Promise.resolve();
  let queued = 0;
  let closed = false;
  let recovery;
  function closeInput() {
    input?.child.kill();
    input = undefined;
  }
  function send(message) {
    if (closed || recovery || queued >= 32) return Promise.reject(new Error('Simulator input is unavailable or busy.'));
    queued++;
    const result = queue.then(async () => {
      if (closed) throw new Error('Simulator session is closed.');
      if (!input) {
        const child = start('input');
        const lines = createInterface({ input: child.stdout });
        const done = () => { lines.close(); if (input?.child === child) input = undefined; };
        child.on('error', done);
        child.on('close', done);
        child.stdin.on('error', done);
        input = { child, lines };
      }
      const current = input;
      const cancel = new AbortController();
      const deadline = AbortSignal.timeout(6000);
      try {
        const signal = AbortSignal.any([deadline, cancel.signal]);
        const reply = Promise.race([
          once(current.lines, 'line', { signal }).then(([line]) => JSON.parse(line)),
          once(current.lines, 'close', { signal }).then(() => { throw new Error('Simulator input closed.'); }),
        ]);
        current.child.stdin.write(JSON.stringify(message) + '\n');
        const ack = await reply;
        if (!ack.ok) throw new Error(ack.error || 'Simulator rejected the input.');
      } catch (error) {
        if (input === current) closeInput();
        if (deadline.aborted) throw new Error('Simulator input timed out.');
        throw error;
      } finally { cancel.abort(); }
    });
    queue = result.catch(() => {}).finally(() => { queued--; });
    return result;
  }
  return {
    stream: () => start('stream', ['--format', 'mjpeg', '--fps', '20', '--scale', '2']),
    send,
    checkOwner,
    reclaim() {
      recovery ??= (async () => {
        if (await readOwner() !== '1') return;
        await queue;
        if (closed) throw new Error('Simulator session is closed.');
        closeInput();
        await run('heal', [], { timeout: 45000 });
        await checkOwner();
      })().finally(() => { recovery = undefined; });
      return recovery;
    },
    async screenshot() {
      return (await run('screenshot', ['--format', 'jpg', '--scale', '2'], { encoding: 'buffer' })).stdout;
    },
    async inspect() { return JSON.parse((await run('describe-ui')).stdout); },
    dispose() { closed = true; closeInput(); },
  };
}
