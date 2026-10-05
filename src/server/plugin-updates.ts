import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { pluginUpdateSchema } from "../shared/plugin-updates.ts";
import type { PluginUpdate } from "../shared/plugin-updates.ts";
import { PLUGIN_VERSION } from "../shared/version.ts";

// Keep the tool contract for existing panels without a network or CLI update path.
export class PluginUpdates {
  private readonly currentVersion: string;
  constructor(options: { currentVersion?: string } = {}) {
    this.currentVersion = options.currentVersion ?? PLUGIN_VERSION;
  }
  async check(): Promise<PluginUpdate> {
    return { status: "disabled", currentVersion: this.currentVersion };
  }
  async install(): Promise<PluginUpdate> {
    throw new Error("This privacy fork disables plugin update checks and installations. Update manually from your fork.");
  }
  close() {}
}

export function registerPluginUpdateTools(server: McpServer, updates: PluginUpdates) {
  const visibility: ("app" | "model")[] = ["app"];
  const metadata = { ui: { visibility } };
  const outputSchema = { update: pluginUpdateSchema };
  registerAppTool(server, "mobile_check_plugin_update", {
    title: "Check Mobile Dev updates", description: "Update checks are disabled in this privacy fork.", inputSchema: {},
    outputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, _meta: metadata,
  }, async () => {
    const update = await updates.check();
    return { content: [], structuredContent: { update } };
  });
  registerAppTool(server, "mobile_install_plugin_update", {
    title: "Update Mobile Dev", description: "Automatic update installation is disabled in this privacy fork.", inputSchema: {},
    outputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }, _meta: metadata,
  }, async () => {
    try {
      const update = await updates.install();
      return { content: [], structuredContent: { update } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update Mobile Dev. Try again.";
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  });
}
