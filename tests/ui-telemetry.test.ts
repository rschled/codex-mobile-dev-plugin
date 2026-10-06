import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

test("UI reporting stays disabled even with opt-in metadata, errors and tool actions", async t => {
  const built = await build({ stdin: { contents: 'export * from "./src/ui/telemetry.ts";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, write: false, format: "iife", globalName: "Telemetry", platform: "browser", target: "chrome120",
    metafile: true, define: { "process.env.NODE_ENV": '\"production\"' } });
  assert.equal(Object.keys(built.metafile!.inputs).some(path => path.includes("@sentry/")), false);
  const dom = new JSDOM('<html><head><meta name="mobile-dev-telemetry" content="on"></head></html>',
    { pretendToBeVisual: true, runScripts: "outside-only" });
  t.after(() => dom.window.close());
  let requests = 0; let observers = 0; let timers = 0; let frames = 0;
  dom.window.fetch = async () => { requests++; throw new Error("External request forbidden"); };
  dom.window.setInterval = () => { timers++; return 1; };
  dom.window.requestAnimationFrame = () => { frames++; return 1; };
  dom.window.PerformanceObserver = class { constructor() { observers++; } };
  dom.window.eval(built.outputFiles[0].text);
  const api = dom.window.Telemetry;
  let calls = 0;
  const app = { async callServerTool(params: unknown) { calls++; return params; } };
  const original = app.callServerTool;
  api.startUiTelemetry(app);
  assert.equal(app.callServerTool, original);
  await app.callServerTool({ name: "mobile_screenshot", arguments: { text: "PRIVATE" } });
  api.setUiSurface("logs"); api.setUiTelemetryContext({ layout: "both" });
  assert.equal(api.getUiTelemetryAttributes().surface, "logs");
  api.captureUiError(new dom.window.Error("PRIVATE"), "test");
  api.recordUiTiming("test", 42); api.setUiGauge("test", 1); api.countUiEvent("test");
  api.markUiSurfaceReady(0); api.flushUiMeasurements(); await api.stopUiTelemetry();
  assert.equal(calls, 1); assert.equal(requests, 0); assert.equal(observers, 0); assert.equal(timers, 0); assert.equal(frames, 0);
});
