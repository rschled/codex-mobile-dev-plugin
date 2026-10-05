// Compatibility API for local UI state; this module has no reporting SDK.
import { Component } from "react";
import type { ReactNode } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import type { Surface, TelemetryAttributes } from "../shared/telemetry.ts";

export class ErrorBoundary extends Component<{ children?: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

let attributes: TelemetryAttributes = { component: "ui", surface: "simulator", view: "panel", layout: "ios" };
export function recordUiTiming(_name: string, _duration: number) {}
export function setUiGauge(_name: string, _value: number) {}
export function countUiEvent(_name: string, _value = 1, _context = attributes) {}
export function flushUiMeasurements() {}
export function setUiSurface(surface: Surface) { attributes = { ...attributes, surface }; }
export function setUiTelemetryContext(next: TelemetryAttributes) { attributes = { ...attributes, ...next }; }
export function getUiTelemetryAttributes(): TelemetryAttributes { return attributes; }
export function captureUiError(_error: unknown, _operation: string, _context = attributes) {}
export function markUiSurfaceReady(_startedAt: number) {}
export function startUiTelemetry(_app: App) {}
export async function stopUiTelemetry() {}
