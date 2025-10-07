/**
 * GitHub CDN Handler
 * Main entry point for serving files from GitHub repository via CDN
 * @module api/cdn
 */

import { config } from '../lib/config.js';
import { Logger } from '../lib/logger.js';
import { LRUCache } from '../lib/cache.js';
import { GitHubClient } from '../lib/github-client.js';
import { getMimeType, isCompressible } from '../lib/mime-types.js';
import { compressContent, shouldCompress } from '../lib/compression.js';
import {
  validateFilePath,
  validateMethod,
  applySecurityHeaders,
  generateETag,
  getClientId,
  RateLimiter,
} from '../lib/security.js';
import {
  sendContent,
  sendNotModified,
  sendError,
  sendMethodNotAllowed,
  hasValidCache,
} from '../lib/response-handler.js';

// --- Initialize Services ---

/**
 * LRU Cache instance for file caching
 * @type {LRUCache}
 */
const fileCache = new LRUCache(
  config.maxCacheSizeBytes,
  config.maxCacheEntries,
  config.serverCacheSeconds
);

/**
 * GitHub client instance
 * @type {GitHubClient}
 */
const githubClient = new GitHubClient({
  rawBaseUrl: config.githubRawBaseUrl,
  userAgent: config.userAgent,
  token: config.githubToken,
});

/**
 * Rate limiter instance (100 requests per minute per client)
 * @type {RateLimiter}
 */
const rateLimiter = new RateLimiter(100, 60000);

/**
 * Fetch file with caching
 * @param {string} filePath - File path to fetch
 * @returns {Promise<Buffer>} File content buffer
 * @private
 */
async function fetchFileWithCache(filePath) {
  const normalizedPath = filePath.replace(/^\/+/, '');
  
  // Check cache first
  const cached = fileCache.get(normalizedPath);
  if (cached) {
    return cached;
  }

  // Cache miss - fetch from GitHub
  Logger.cacheMiss(normalizedPath);
  const buffer = await githubClient.fetchFile(normalizedPath);
  
  // Store in cache
  fileCache.set(normalizedPath, buffer);
  
  return buffer;
}

/**
 * Main CDN handler
 * Serves files from GitHub repository with caching, compression, and security
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<Object>} Response
 */
export default async function handler(req, res) {
  const startTime = Date.now();
  
  try {
    // Validate HTTP method
    if (req.method !== 'GET') {
      return sendMethodNotAllowed(res, ['GET']);
    }

    // Get and validate file path
    const requestedFile = req.query.file;
    const safePath = validateFilePath(requestedFile);

    // Rate limiting (optional - can be disabled in production)
    const clientId = getClientId(req);
    try {
      rateLimiter.checkLimit(clientId);
    } catch (rateLimitError) {
      // Rate limit errors are handled by sendError
      return sendError(res, rateLimitError, safePath);
    }

    // Log request
    Logger.request(req.method, safePath, clientId);

    // Fetch file (with caching)
    const fileBuffer = await fetchFileWithCache(safePath);
    
    // Get MIME type and generate ETag
    const mimeType = getMimeType(safePath);
    const etag = generateETag(fileBuffer);

    // Apply security headers
    applySecurityHeaders(res);

    // Check client cache
    if (hasValidCache(req, etag)) {
      Logger.response(safePath, 304, Date.now() - startTime);
      return sendNotModified(res);
    }

    // Handle compression
    let finalBuffer = fileBuffer;
    let contentEncoding = null;

    if (shouldCompress(mimeType, fileBuffer.length, config.minCompressionSizeBytes, isCompressible)) {
      const acceptEncoding = req.headers['accept-encoding'] || '';
      const compressionResult = await compressContent(fileBuffer, acceptEncoding);
      
      if (compressionResult.buffer) {
        finalBuffer = compressionResult.buffer;
        contentEncoding = compressionResult.encoding;
      }
    }

    // Send response
    Logger.response(safePath, 200, Date.now() - startTime);
    return sendContent(res, finalBuffer, {
      contentType: mimeType,
      etag,
      cacheSeconds: config.clientCacheSeconds,
      contentEncoding,
    });

  } catch (error) {
    const safePath = req.query?.file || 'unknown';
    Logger.error('CDN handler error', { error, path: safePath });
    return sendError(res, error, safePath);
  }
}
