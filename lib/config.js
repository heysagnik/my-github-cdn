/**
 * Configuration Module
 * Provides centralized configuration management with validation
 * @module lib/config
 */

/**
 * Validates and parses an integer from environment variable
 * @param {string} value - The value to parse
 * @param {number} defaultValue - The default value if parsing fails
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} Validated integer value
 */
function parseIntWithValidation(value, defaultValue, min = 0, max = Infinity) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

/**
 * Configuration object containing all CDN settings
 * @typedef {Object} CDNConfig
 * @property {string} repoOwner - GitHub repository owner
 * @property {string} repoName - GitHub repository name
 * @property {string} repoBranch - GitHub repository branch
 * @property {string|undefined} githubToken - Optional GitHub API token
 * @property {number} serverCacheSeconds - Server-side cache duration in seconds
 * @property {number} clientCacheSeconds - Client-side cache duration in seconds
 * @property {number} minCompressionSizeBytes - Minimum file size for compression
 * @property {number} maxCacheSizeBytes - Maximum total cache size in bytes
 * @property {number} maxCacheEntries - Maximum number of cache entries
 * @property {string} githubRawBaseUrl - Base URL for GitHub raw content
 * @property {string} userAgent - User agent string for GitHub requests
 */

/**
 * Loads and validates configuration from environment variables
 * @returns {CDNConfig} Configuration object
 * @throws {Error} If required configuration is invalid
 */
export function loadConfig() {
  const repoOwner = process.env.GITHUB_REPO_OWNER || 'heysagnik';
  const repoName = process.env.GITHUB_REPO_NAME || 'my-github-cdn';
  const repoBranch = process.env.GITHUB_REPO_BRANCH || 'main';
  const githubToken = process.env.GITHUB_TOKEN;

  // Validate required fields
  if (!repoOwner || typeof repoOwner !== 'string') {
    throw new Error('Invalid GITHUB_REPO_OWNER configuration');
  }
  if (!repoName || typeof repoName !== 'string') {
    throw new Error('Invalid GITHUB_REPO_NAME configuration');
  }
  if (!repoBranch || typeof repoBranch !== 'string') {
    throw new Error('Invalid GITHUB_REPO_BRANCH configuration');
  }

  const serverCacheSeconds = parseIntWithValidation(
    process.env.CDN_SERVER_CACHE_SECONDS,
    300, // 5 minutes default
    0,
    86400 // Max 24 hours
  );

  const clientCacheSeconds = parseIntWithValidation(
    process.env.CDN_CLIENT_CACHE_SECONDS,
    3600, // 1 hour default
    0,
    31536000 // Max 1 year
  );

  const minCompressionSizeBytes = parseIntWithValidation(
    process.env.CDN_MIN_COMPRESSION_SIZE_BYTES,
    1024, // 1KB default
    0,
    1048576 // Max 1MB
  );

  const maxCacheSizeBytes = parseIntWithValidation(
    process.env.CDN_MAX_CACHE_SIZE_BYTES,
    104857600, // 100MB default
    1048576, // Min 1MB
    1073741824 // Max 1GB
  );

  const maxCacheEntries = parseIntWithValidation(
    process.env.CDN_MAX_CACHE_ENTRIES,
    1000,
    10,
    10000
  );

  const githubRawBaseUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${repoBranch}`;
  const userAgent = `Vercel-CDN/${repoOwner}-${repoName}`;

  return {
    repoOwner,
    repoName,
    repoBranch,
    githubToken,
    serverCacheSeconds,
    clientCacheSeconds,
    minCompressionSizeBytes,
    maxCacheSizeBytes,
    maxCacheEntries,
    githubRawBaseUrl,
    userAgent,
  };
}

/**
 * Global configuration instance
 * @type {CDNConfig}
 */
export const config = loadConfig();
