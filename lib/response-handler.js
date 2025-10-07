/**
 * Response Handler Utility Module
 * Provides utilities for handling HTTP responses
 * @module lib/response-handler
 */

import { Logger } from './logger.js';
import { CDNError } from './errors.js';

/**
 * Send successful response with content
 * @param {Object} res - Response object
 * @param {Buffer} content - Content buffer
 * @param {Object} options - Response options
 * @param {string} options.contentType - Content MIME type
 * @param {string} options.etag - ETag value
 * @param {number} options.cacheSeconds - Cache duration in seconds
 * @param {string} [options.contentEncoding] - Content encoding (if compressed)
 */
export function sendContent(res, content, options) {
  const { contentType, etag, cacheSeconds, contentEncoding } = options;

  // Set content headers
  res.setHeader('Content-Type', contentType);
  res.setHeader('ETag', `"${etag}"`);
  res.setHeader('Cache-Control', `public, max-age=${cacheSeconds}`);
  res.setHeader('Vary', 'Accept-Encoding');

  // Set compression header if applicable
  if (contentEncoding) {
    res.setHeader('Content-Encoding', contentEncoding);
  }

  res.setHeader('Content-Length', content.length);

  return res.status(200).send(content);
}

/**
 * Send 304 Not Modified response
 * @param {Object} res - Response object
 */
export function sendNotModified(res) {
  Logger.debug('Sending 304 Not Modified');
  return res.status(304).end();
}

/**
 * Send error response
 * @param {Object} res - Response object
 * @param {Error} error - Error object
 * @param {string} [path] - Request path (for logging)
 */
export function sendError(res, error, path = 'unknown') {
  let statusCode = 500;
  let errorResponse = {
    error: 'Internal server error',
  };

  if (error instanceof CDNError) {
    statusCode = error.statusCode;
    errorResponse = {
      error: error.message,
    };

    // Add details for specific errors
    if (error.details) {
      errorResponse.details = error.details;
    }
  } else {
    // Log unexpected errors
    Logger.error('Unexpected error occurred', error);
    errorResponse = {
      error: 'Failed to retrieve file.',
      details: error.message,
    };
  }

  Logger.response(path, statusCode);
  return res.status(statusCode).json(errorResponse);
}

/**
 * Send method not allowed response
 * @param {Object} res - Response object
 * @param {string[]} allowedMethods - Array of allowed HTTP methods
 */
export function sendMethodNotAllowed(res, allowedMethods = ['GET']) {
  res.setHeader('Allow', allowedMethods.join(', '));
  Logger.warn('Method not allowed');
  return res.status(405).end('Method Not Allowed');
}

/**
 * Check if client has fresh cache based on ETag
 * @param {Object} req - Request object
 * @param {string} etag - Current ETag value
 * @returns {boolean} True if client cache is fresh
 */
export function hasValidCache(req, etag) {
  const clientEtag = req.headers['if-none-match'];
  return clientEtag === `"${etag}"`;
}

/**
 * Set CORS headers if needed
 * @param {Object} res - Response object
 * @param {string} [origin] - Allowed origin (default: *)
 */
export function setCORSHeaders(res, origin = '*') {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

/**
 * Handle OPTIONS request for CORS preflight
 * @param {Object} res - Response object
 */
export function handleOptionsRequest(res) {
  setCORSHeaders(res);
  return res.status(204).end();
}
