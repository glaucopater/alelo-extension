const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const STAGING = path.join(DIST, ".pack-staging");

function zipPathForVersion(version) {
  return path.join(DIST, `alelo-extension-${version}.zip`);
}

const PACK_FILES = [
  "manifest.json",
  "service-worker.js",
  "constants.js",
  "config.js",
  "llm-api.js",
  "language-flags.js",
  "content.js",
  "content.html",
  "content.css",
  "rules",
  "icons",
  "LICENSE"
];

function readVersion() {
  const manifestPath = path.join(ROOT, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return String(manifest.version || "0.0.0");
}

function assertPackFilesExist() {
  const missing = PACK_FILES.filter((item) => !fs.existsSync(path.join(ROOT, item)));
  if (missing.length) {
    throw new Error(`Missing files required for pack: ${missing.join(", ")}`);
  }
}

function stageExtensionFiles() {
  fs.rmSync(STAGING, { recursive: true, force: true });
  fs.mkdirSync(STAGING, { recursive: true });

  for (const item of PACK_FILES) {
    fs.cpSync(path.join(ROOT, item), path.join(STAGING, item), { recursive: true });
  }
}

function createZipArchive(zipPath) {
  fs.mkdirSync(DIST, { recursive: true });
  fs.rmSync(zipPath, { force: true });

  if (process.platform === "win32") {
    const psStaging = STAGING.replace(/'/g, "''");
    const psZip = zipPath.replace(/'/g, "''");
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${psStaging}\\*' -DestinationPath '${psZip}' -Force"`,
      { stdio: "inherit" }
    );
    return;
  }

  execSync(`cd "${STAGING}" && zip -r "${zipPath}" .`, { stdio: "inherit" });
}

function main() {
  assertPackFilesExist();
  const version = readVersion();
  const zipPath = zipPathForVersion(version);
  stageExtensionFiles();
  createZipArchive(zipPath);
  fs.rmSync(STAGING, { recursive: true, force: true });

  console.log(`Packed Alelo v${version} -> ${zipPath}`);
  console.log("Load unpacked: select the repo folder in chrome://extensions/");
  console.log("Or upload the zip when publishing to the Chrome Web Store.");
}

main();
