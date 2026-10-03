// plugins/withPreviewArch.js
const { withGradleProperties } = require("expo/config-plugins");

module.exports = (config) =>
  withGradleProperties(config, (c) => {
    if (process.env.EAS_BUILD_PROFILE === "preview") {
      c.modResults = c.modResults.filter(
        (i) => !(i.type === "property" && i.key === "reactNativeArchitectures")
      );
      c.modResults.push({
        type: "property",
        key: "reactNativeArchitectures",
        value: "arm64-v8a",
      });
    }
    return c;
  });
