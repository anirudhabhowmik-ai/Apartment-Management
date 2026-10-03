// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const config = getDefaultConfig(__dirname);

function firstExisting(dir, names) {
  for (const name of names) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Native: never bundle browser-only PDF libs
  if (
    platform !== "web" &&
    (moduleName === "html2pdf.js" ||
      moduleName === "html2canvas" ||
      moduleName === "jspdf")
  ) {
    return { type: "empty" };
  }

  // Web: force jspdf ESM build
  if (moduleName === "jspdf" && platform === "web") {
    const distDir = path.resolve(__dirname, "node_modules/jspdf/dist");
    const entry = firstExisting(distDir, ["jspdf.es.min.js", "jspdf.es.js"]);
    if (entry) return { type: "sourceFile", filePath: entry };
  }

  // Web: force html2canvas ESM build
  if (moduleName === "html2canvas" && platform === "web") {
    const distDir = path.resolve(__dirname, "node_modules/html2canvas/dist");
    const entry = firstExisting(distDir, [
      "html2canvas.esm.js",
      "html2canvas.min.js",
      "html2canvas.js",
    ]);
    if (entry) return { type: "sourceFile", filePath: entry };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
