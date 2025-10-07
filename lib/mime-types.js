/**
 * MIME Type Utility Module
 * Provides MIME type detection and compression checks
 * @module lib/mime-types
 */

import path from 'path';

/**
 * MIME type mapping by file extension
 * @type {Object.<string, string>}
 */
const MIME_TYPES = {
  // Text formats
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  
  // JavaScript/JSON
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jsonld': 'application/ld+json; charset=utf-8',
  
  // Images
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  
  // Fonts
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.eot': 'application/vnd.ms-fontobject',
  
  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  
  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  
  // Archives
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
  
  // Default
  'default': 'application/octet-stream',
};

/**
 * Content type prefixes that are compressible
 * @type {string[]}
 */
const COMPRESSIBLE_TYPES_PREFIX = [
  'text/',
  'application/javascript',
  'application/json',
  'application/xml',
  'application/ld+json',
  'image/svg+xml',
  'font/',
];

/**
 * Get MIME type for a file path
 * @param {string} filePath - File path
 * @returns {string} MIME type
 */
export function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || MIME_TYPES.default;
}

/**
 * Check if a content type is compressible
 * @param {string} contentType - Content type to check
 * @returns {boolean} True if compressible
 */
export function isCompressible(contentType) {
  return COMPRESSIBLE_TYPES_PREFIX.some((prefix) => 
    contentType.startsWith(prefix)
  );
}

/**
 * Get all supported MIME types
 * @returns {Object.<string, string>} MIME type mapping
 */
export function getAllMimeTypes() {
  return { ...MIME_TYPES };
}

/**
 * Check if file extension is supported
 * @param {string} extension - File extension (with or without dot)
 * @returns {boolean} True if supported
 */
export function isSupportedExtension(extension) {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return ext.toLowerCase() in MIME_TYPES;
}
