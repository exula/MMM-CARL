"use strict";
class ConfigError extends Error {}
function loadSettings(config = {}) {
  let url;
  try { url = new URL(config.catalogUrl || "https://catalogplus.libraryweb.org"); }
  catch { throw new ConfigError("MMM-CARL: catalogUrl must be a valid HTTPS catalog address."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new ConfigError("MMM-CARL: catalogUrl must use HTTPS without credentials, a query, or a fragment.");
  }
  const pollSeconds = Number(config.pollSeconds ?? 3600);
  if (!Number.isFinite(pollSeconds) || pollSeconds < 300 || pollSeconds > 86400) {
    throw new ConfigError("MMM-CARL: pollSeconds must be between 300 and 86400.");
  }
  const configName = config.configName ?? "default";
  if (typeof configName !== "string" || !/^[\w-]{1,100}$/.test(configName)) {
    throw new ConfigError("MMM-CARL: configName must contain only letters, numbers, underscores or hyphens.");
  }
  return { baseUrl: url.href.replace(/\/+$/, ""), configName, interval: pollSeconds * 1000 };
}
module.exports = { loadSettings, ConfigError };
