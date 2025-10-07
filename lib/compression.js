/**
 * Compression Service Module
 * Handles content compression with multiple algorithms
 * @module lib/compression
 */

import { promisify } from 'util';
import zlib from 'zlib';
import { Logger } from './logger.js';
import { CompressionError } from './errors.js';

/**
 * Promisified compression functions
 */
const brotliCompressAsync = promisify(zlib.brotliCompress);
const gzipAsync = promisify(zlib.gzip);
const deflateAsync = promisify(zlib.deflate);

/**
 * Compression result
 * @typedef {Object} CompressionResult
 * @property {Buffer|null} buffer - Compressed buffer (null if compression failed or not beneficial)
 * @property {string|null} encoding - Content encoding used ('br', 'gzip', 'deflate', or null)
 * @property {number} originalSize - Original buffer size
 * @property {number} compressedSize - Compressed buffer size (0 if not compressed)
 * @property {number} compressionRatio - Compression ratio (0 if not compressed)
 */

/**
 * Compression options
 * @typedef {Object} CompressionOptions
 * @property {number} [brotliQuality=4] - Brotli compression quality (0-11)
 * @property {number} [gzipLevel=6] - Gzip compression level (0-9)
 */

/**
 * Compress buffer using Brotli algorithm
 * @param {Buffer} buffer - Buffer to compress
 * @param {number} quality - Compression quality (0-11)
 * @returns {Promise<Buffer|null>} Compressed buffer or null on failure
 * @private
 */
async function compressBrotli(buffer, quality = 4) {
  try {
    const compressed = await brotliCompressAsync(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: quality,
      },
    });
    return compressed;
  } catch (error) {
    Logger.warn('Brotli compression failed', { error: error.message });
    return null;
  }
}

/**
 * Compress buffer using Gzip algorithm
 * @param {Buffer} buffer - Buffer to compress
 * @param {number} level - Compression level (0-9)
 * @returns {Promise<Buffer|null>} Compressed buffer or null on failure
 * @private
 */
async function compressGzip(buffer, level = 6) {
  try {
    const compressed = await gzipAsync(buffer, { level });
    return compressed;
  } catch (error) {
    Logger.warn('Gzip compression failed', { error: error.message });
    return null;
  }
}

/**
 * Compress buffer using Deflate algorithm
 * @param {Buffer} buffer - Buffer to compress
 * @param {number} level - Compression level (0-9)
 * @returns {Promise<Buffer|null>} Compressed buffer or null on failure
 * @private
 */
async function compressDeflate(buffer, level = 6) {
  try {
    const compressed = await deflateAsync(buffer, { level });
    return compressed;
  } catch (error) {
    Logger.warn('Deflate compression failed', { error: error.message });
    return null;
  }
}

/**
 * Compress content based on accept-encoding header
 * @param {Buffer} buffer - Content to compress
 * @param {string} acceptEncoding - Accept-Encoding header value
 * @param {CompressionOptions} [options={}] - Compression options
 * @returns {Promise<CompressionResult>} Compression result
 */
export async function compressContent(buffer, acceptEncoding = '', options = {}) {
  const originalSize = buffer.length;
  const result = {
    buffer: null,
    encoding: null,
    originalSize,
    compressedSize: 0,
    compressionRatio: 0,
  };

  const acceptEncodingLower = acceptEncoding.toLowerCase();
  const { brotliQuality = 4, gzipLevel = 6 } = options;

  // Try Brotli first (best compression)
  if (acceptEncodingLower.includes('br')) {
    const compressed = await compressBrotli(buffer, brotliQuality);
    if (compressed && compressed.length < originalSize) {
      result.buffer = compressed;
      result.encoding = 'br';
      result.compressedSize = compressed.length;
      result.compressionRatio = ((originalSize - compressed.length) / originalSize * 100).toFixed(2);
      Logger.debug('Brotli compression applied', {
        originalSize,
        compressedSize: compressed.length,
        ratio: result.compressionRatio + '%',
      });
      return result;
    }
  }

  // Try Gzip next (widely supported)
  if (acceptEncodingLower.includes('gzip')) {
    const compressed = await compressGzip(buffer, gzipLevel);
    if (compressed && compressed.length < originalSize) {
      result.buffer = compressed;
      result.encoding = 'gzip';
      result.compressedSize = compressed.length;
      result.compressionRatio = ((originalSize - compressed.length) / originalSize * 100).toFixed(2);
      Logger.debug('Gzip compression applied', {
        originalSize,
        compressedSize: compressed.length,
        ratio: result.compressionRatio + '%',
      });
      return result;
    }
  }

  // Try Deflate as fallback
  if (acceptEncodingLower.includes('deflate')) {
    const compressed = await compressDeflate(buffer, gzipLevel);
    if (compressed && compressed.length < originalSize) {
      result.buffer = compressed;
      result.encoding = 'deflate';
      result.compressedSize = compressed.length;
      result.compressionRatio = ((originalSize - compressed.length) / originalSize * 100).toFixed(2);
      Logger.debug('Deflate compression applied', {
        originalSize,
        compressedSize: compressed.length,
        ratio: result.compressionRatio + '%',
      });
      return result;
    }
  }

  Logger.debug('No compression applied', { originalSize });
  return result;
}

/**
 * Check if compression should be attempted based on content type and size
 * @param {string} contentType - Content MIME type
 * @param {number} contentSize - Content size in bytes
 * @param {number} minSize - Minimum size threshold for compression
 * @param {Function} isCompressibleFn - Function to check if content type is compressible
 * @returns {boolean} True if compression should be attempted
 */
export function shouldCompress(contentType, contentSize, minSize, isCompressibleFn) {
  return isCompressibleFn(contentType) && contentSize >= minSize;
}
