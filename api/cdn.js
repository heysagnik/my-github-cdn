import fetch from 'node-fetch';
import { promisify } from 'util';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';

// --- Configuration (Defaults, can be overridden by Vercel Environment Variables) ---
const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'heysagnik';
const REPO_NAME = process.env.GITHUB_REPO_NAME || 'my-github-cdn';
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH || 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Optional: For private repos or higher rate limits

const SERVER_CACHE_SECONDS = parseInt(process.env.CDN_SERVER_CACHE_SECONDS, 10) || 300; // 5 minutes
const CLIENT_CACHE_SECONDS = parseInt(process.env.CDN_CLIENT_CACHE_SECONDS, 10) || 3600; // 1 hour
const MIN_COMPRESSION_SIZE_BYTES = parseInt(process.env.CDN_MIN_COMPRESSION_SIZE_BYTES, 10) || 1024; // 1KB

const GITHUB_RAW_BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}`;
const USER_AGENT = `Vercel-CDN/${REPO_OWNER}-${REPO_NAME}`;

// --- In-memory cache for fetched GitHub files ---
const fileCache = new Map();

// --- MIME Types ---
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jsonld': 'application/ld+json; charset=utf-8',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.pdf': 'application/pdf', '.zip': 'application/zip',
  'default': 'application/octet-stream'
};

// --- Compressible Content Types ---
const COMPRESSIBLE_TYPES_PREFIX = [
  'text/', 'application/javascript', 'application/json', 'application/xml',
  'image/svg+xml', 'font/'
];

// --- Helper Functions ---
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || MIME_TYPES.default;
}

function isCompressible(contentType) {
  return COMPRESSIBLE_TYPES_PREFIX.some((prefix) => contentType.startsWith(prefix));
}

function generateETag(contentBuffer) {
  return crypto.createHash('sha256').update(contentBuffer).digest('hex');
}

async function fetchAndCacheFileFromGitHub(filePath) {
  const normalizedPath = filePath.replace(/^\/+/, ''); // Remove leading slashes
  const cacheEntry = fileCache.get(normalizedPath);

  if (cacheEntry && Date.now() < cacheEntry.expiresAt) {
    // console.log(`[CDN Cache HIT]: ${normalizedPath}`);
    return cacheEntry.data;
  }
  // console.log(`[CDN Cache MISS]: ${normalizedPath}, Fetching from GitHub...`);

  const githubUrl = `${GITHUB_RAW_BASE_URL}/${normalizedPath}`;
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/vnd.github.v3.raw' // Ensure raw content
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  }

  const response = await fetch(githubUrl, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(
      `GitHub fetch error for ${normalizedPath}: ${response.status} ${response.statusText}. Details: ${errorText.slice(0, 200)}`
    );
    error.statusCode = response.status === 404 ? 404 : 502; // 502 for Bad Gateway if GitHub fails other than 404
    if (response.status === 404) error.code = 'ENOENT';
    throw error;
  }

  const buffer = await response.buffer();
  fileCache.set(normalizedPath, {
    data: buffer,
    expiresAt: Date.now() + SERVER_CACHE_SECONDS * 1000,
  });
  return buffer;
}

// --- Main Handler ---
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  const requestedFile = req.query.file;
  if (typeof requestedFile !== 'string' || !requestedFile) {
    return res.status(400).json({ error: 'Query parameter "file" is required.' });
  }

  // Sanitize path: normalize, remove leading/trailing slashes, prevent traversal
  const safePath = path.posix.normalize(requestedFile.trim().replace(/^\/+|\/+$/, ''));
  if (safePath.startsWith('..') || safePath.includes('/..')) {
    return res.status(400).json({ error: 'Invalid file path (directory traversal attempt detected).' });
  }
  if (!safePath || safePath === '.') {
     return res.status(400).json({ error: 'Invalid or empty file path specified.' });
  }

  try {
    const fileBuffer = await fetchAndCacheFileFromGitHub(safePath);
    const mimeType = getMimeType(safePath);
    const etag = generateETag(fileBuffer);

    // --- Set HTTP Headers ---
    res.setHeader('Content-Type', mimeType);
    res.setHeader('ETag', `"${etag}"`); // Strong ETag, quoted
    res.setHeader('Cache-Control', `public, max-age=${CLIENT_CACHE_SECONDS}`);
    res.setHeader('Vary', 'Accept-Encoding'); // Important for compression

    // Security Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY'); // No embedding in iframes
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()'); // Deny sensitive APIs

    // Check for client cache (If-None-Match)
    if (req.headers['if-none-match'] === `"${etag}"`) {
      return res.status(304).end(); // Not Modified
    }

    // --- Compression ---
    const acceptEncoding = req.headers['accept-encoding'] || '';
    let compressedBuffer = null;
    let contentEncoding = null;

    if (isCompressible(mimeType) && fileBuffer.length > MIN_COMPRESSION_SIZE_BYTES) {
      if (acceptEncoding.includes('br')) { // Brotli preferred
        try {
          compressedBuffer = await promisify(zlib.brotliCompress)(fileBuffer);
          contentEncoding = 'br';
        } catch (e) { /* Brotli might not be available or fail */ }
      }
      if (!compressedBuffer && acceptEncoding.includes('gzip')) {
        try {
          compressedBuffer = await promisify(zlib.gzip)(fileBuffer);
          contentEncoding = 'gzip';
        } catch (e) { /* Gzip might fail */ }
      }
      // Deflate is less common now, often skipped if gzip is available
    }

    if (compressedBuffer && contentEncoding) {
      res.setHeader('Content-Encoding', contentEncoding);
      res.setHeader('Content-Length', compressedBuffer.length);
      return res.status(200).send(compressedBuffer);
    } else {
      res.setHeader('Content-Length', fileBuffer.length);
      return res.status(200).send(fileBuffer);
    }

  } catch (error) {
    const statusCode = error.statusCode || (error.code === 'ENOENT' ? 404 : 500);
    // console.error(`[CDN Operation Failed] Path: ${safePath}, Status: ${statusCode}, Error: ${error.message}`);
    if (statusCode === 404) {
      return res.status(404).json({ error: `File not found in repository: ${safePath}` });
    }
    return res.status(statusCode).json({ error: 'Failed to retrieve file.', details: error.message });
  }
}
