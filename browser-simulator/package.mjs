import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { baguetteTelemetrySourceHash } from '../scripts/rebuild-baguette.mjs';

const source = dirname(fileURLToPath(import.meta.url));
const repo = dirname(source);
process.chdir(repo);
const vendor = join(repo, 'vendor/baguette');
const name = 'ios-simulator-browser';
const marketplace = join(repo, 'release/browser-marketplace');
const plugin = join(marketplace, 'plugins', name);
const catalog = join(marketplace, '.agents/plugins');
const expected = JSON.parse(await readFile(join(repo, 'vendor/baguette-release.json'), 'utf8'));
const release = JSON.parse(await readFile(join(vendor, 'release.json'), 'utf8'));
const binary = await readFile(join(vendor, 'Baguette'));
const digest = createHash('sha256').update(binary).digest('hex');
if (release.build?.sourceCommit !== expected.rebuild.sourceCommit || release.build.binarySha256 !== digest
    || release.build.telemetrySourceSHA256 !== await baguetteTelemetrySourceHash()) {
  throw new Error('Rebuild the pinned Baguette runtime with npm run rebuild:baguette before packaging.');
}
await rm(plugin, { recursive: true, force: true });
await mkdir(catalog, { recursive: true });
await cp(join(source, 'plugin'), plugin, { recursive: true });
const { metafile } = await build({
  entryPoints: [join(source, 'server.mjs')], outfile: join(plugin, 'server.mjs'),
  bundle: true, platform: 'node', target: 'node22', format: 'esm', metafile: true, legalComments: 'eof',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const packageRoots = new Set();
for (const input of Object.keys(metafile.inputs)) {
  const path = resolve(input);
  const packages = [...path.matchAll(/\/node_modules\/((?:@[^/]+\/)?[^/]+)\//g)];
  const last = packages.at(-1);
  if (last) packageRoots.add(path.slice(0, last.index + last[0].length - 1));
}
const notices = [];
for (const directory of [...packageRoots].sort()) {
  const { name, version, license } = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  notices.push(`${name} ${version} (${license ?? 'see package notices'})`);
  const files = (await readdir(directory)).filter(file => /^(LICENSE|LICENCE|COPYING|NOTICE)(\.|$)/i.test(file));
  for (const file of files.sort()) notices.push(await readFile(join(directory, file), 'utf8'));
}
await writeFile(join(plugin, 'javascript-licenses.txt'), notices.join('\n\n'));
for (const name of ['viewer.html', 'viewer.js', 'viewer.css']) await copyFile(join(source, name), join(plugin, name));
for (const name of ['Baguette', 'LICENSE', 'third-party-licenses.txt', 'release.json']) await copyFile(join(vendor, name), join(plugin, name));
await writeFile(join(catalog, 'marketplace.json'), JSON.stringify({
  name: 'ios-simulator-local',
  interface: { displayName: 'iOS Simulator Local' },
  plugins: [{ name, source: { source: 'local', path: `./plugins/${name}` },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Developer Tools' }],
}, null, 2) + '\n');
console.log(marketplace);
