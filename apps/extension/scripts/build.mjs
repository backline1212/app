import archiver from "archiver";
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

// Baked into the bundle as literal strings (src/lib/config.ts, env.d.ts) - a browser
// extension has no runtime env to read at load time, unlike apps/web's Vite build.
// Defaults point at the real deployed stack (this is the build the Dockerfile and the
// "Download extension" link both produce); override for a local-dev-stack build via
// these two environment variables when running this script directly.
const define = {
  __API_BASE_URL__: JSON.stringify(
    process.env.BACKLINE_API_BASE_URL ?? "https://app-production-f121.up.railway.app",
  ),
  __DASHBOARD_BASE_URL__: JSON.stringify(
    process.env.BACKLINE_DASHBOARD_BASE_URL ?? "https://backline-qa.vercel.app",
  ),
};

// MV3 service workers may declare "type": "module" in the manifest, so background.js
// can stay a real ES module - but content scripts have no such option (Chrome always
// loads a manifest content script as a classic script), so content-script.js has to be
// a single dependency-free IIFE instead. Vite's lib mode can't give two entries two
// different output formats in one build, which is the whole reason this uses esbuild
// directly rather than Vite (apps/widget's own approach) for this app.
await esbuild.build({
  entryPoints: [path.join(rootDir, "src/background.ts")],
  bundle: true,
  format: "esm",
  outfile: path.join(distDir, "background.js"),
  target: "chrome110",
  define,
});

await esbuild.build({
  entryPoints: [path.join(rootDir, "src/content-script.ts")],
  bundle: true,
  format: "iife",
  outfile: path.join(distDir, "content-script.js"),
  target: "chrome110",
  define,
});

await esbuild.build({
  entryPoints: [path.join(rootDir, "src/popup.ts")],
  bundle: true,
  format: "iife",
  outfile: path.join(distDir, "popup.js"),
  target: "chrome110",
  define,
});

fs.copyFileSync(path.join(rootDir, "manifest.json"), path.join(distDir, "manifest.json"));
fs.copyFileSync(path.join(rootDir, "src/popup.html"), path.join(distDir, "popup.html"));

// Zipped for direct download from Settings > Browser Extension (backend/app/main.py
// mounts this dist dir at /extension) ahead of a Chrome Web Store listing existing -
// a member unzips it and loads it unpacked via chrome://extensions. Built from the
// already-built dist/ files, so this must run after everything above it, and the zip
// itself is excluded from its own contents.
await new Promise((resolve, reject) => {
  const output = fs.createWriteStream(path.join(distDir, "backline-extension.zip"));
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);
  archive.glob("**/*", { cwd: distDir, ignore: ["backline-extension.zip"] });
  void archive.finalize();
});

console.log(`Built extension to ${distDir}`);
