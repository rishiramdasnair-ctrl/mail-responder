/**
 * Deployment build script for ReplyAI Mobile.
 *
 * The iOS/Android app is distributed via EAS (TestFlight / App Store),
 * NOT via this Replit deployment. Running Metro bundler on Cloud Run
 * is not supported (no sufficient resources, wrong environment).
 *
 * This script simply sets up the static-build directory so that
 * serve.js can start successfully and show a landing page to
 * any browser visitors of this URL.
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const staticBuild = path.join(projectRoot, "static-build");

console.log("ReplyAI Mobile — preparing static deployment...");

// Create the directory structure that serve.js expects.
// (serve.js handles missing manifests gracefully with a 404.)
const dirs = [
  path.join(staticBuild, "ios"),
  path.join(staticBuild, "android"),
];

for (const dir of dirs) {
  fs.mkdirSync(dir, { recursive: true });
}

console.log("Static build directories created.");
console.log("The iOS/Android app is distributed via EAS — not from this URL.");
console.log("Build complete.");
process.exit(0);
