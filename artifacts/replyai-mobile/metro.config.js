const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Include workspace root so Metro can resolve pnpm hoisted packages
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Force single canonical React instance to prevent duplicate-React hook errors
const reactRealPath = fs.realpathSync(path.resolve(projectRoot, "node_modules/react"));
const reactDomRealPath = fs.realpathSync(path.resolve(projectRoot, "node_modules/react-dom"));

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve("buffer"),
  react: reactRealPath,
  "react-dom": reactDomRealPath,
};

// Web-only stubs for native-only packages
const WEB_STUBS = {
  "react-native-reanimated": path.join(projectRoot, "stubs/reanimated.js"),
  "react-native-keyboard-controller": path.join(projectRoot, "stubs/keyboard-controller.js"),
  "react-native-worklets": path.join(projectRoot, "stubs/reanimated.js"),
};

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
    for (const [pkg, stub] of Object.entries(WEB_STUBS)) {
      if (moduleName === pkg || moduleName.startsWith(pkg + "/")) {
        return { filePath: stub, type: "sourceFile" };
      }
    }
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
