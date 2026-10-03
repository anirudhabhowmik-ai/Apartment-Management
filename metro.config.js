const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Ensure html2pdf.js can never end up in an Android/iOS bundle.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "html2pdf.js" && platform !== "web") {
    return { type: "empty" };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
