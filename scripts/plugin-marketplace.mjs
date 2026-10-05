export function pluginMarketplace(pluginName, publicRelease = false) {
  return {
    name: "mobile-dev-private",
    interface: { displayName: "Mobile Dev private" },
    plugins: [{
      name: pluginName,
      source: { source: "local", path: `./plugins/${pluginName}` },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Developer Tools",
    }],
  };
}
