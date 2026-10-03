const fs = require("node:fs");
const path = require("node:path");

const outputDirectory = path.join(process.cwd(), "dist");
const sitemapPath = path.join(outputDirectory, "sitemap.xml");
const robotsPath = path.join(outputDirectory, "robots.txt");
const configuredSiteUrl = process.env.EXPO_PUBLIC_SITE_URL?.trim();

if (!fs.existsSync(outputDirectory)) {
  throw new Error("Web export output was not found at dist/.");
}

let siteUrl;
if (configuredSiteUrl) {
  const parsedSiteUrl = new URL(configuredSiteUrl);
  if (parsedSiteUrl.protocol !== "https:") {
    throw new Error("EXPO_PUBLIC_SITE_URL must use HTTPS.");
  }
  siteUrl = parsedSiteUrl.toString().replace(/\/+$/, "");
}

const robotsLines = ["User-agent: *", "Allow: /"];
if (siteUrl) {
  robotsLines.push(`Sitemap: ${siteUrl}/sitemap.xml`);

  const escapedSiteUrl = siteUrl.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  fs.writeFileSync(
    sitemapPath,
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url><loc>${escapedSiteUrl}/</loc></url>\n` +
      `</urlset>\n`,
  );
} else {
  fs.rmSync(sitemapPath, { force: true });
  console.warn(
    "EXPO_PUBLIC_SITE_URL is not set; canonical tags and sitemap.xml were omitted.",
  );
}

fs.writeFileSync(robotsPath, `${robotsLines.join("\n")}\n`);
