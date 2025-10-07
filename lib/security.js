/**
 * Security Utilities Module
 * Provides security-related functionality including rate limiting and validation
 * @module lib/security
 */

import path from 'path';
import { ValidationError, RateLimitError } from './errors.js';
import { Logger } from './logger.js';

/**
 * Simple in-memory rate limiter using sliding window
 */
export class RateLimiter {
  /**
   * Creates a rate limiter
   * @param {number} maxRequests - Maximum requests allowed in the time window
   * @param {number} windowMs - Time window in milliseconds
   */
  constructor(maxRequests = 100, windowMs = 60000) {
    /** @type {Map<string, number[]>} */
    this.requests = new Map();
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.cleanupInterval = null;
    
    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Check if a client is rate limited
   * @param {string} clientId - Client identifier (IP address, user ID, etc.)
   * @returns {boolean} True if request is allowed
   * @throws {RateLimitError} If rate limit is exceeded
   */
  checkLimit(clientId) {
    const now = Date.now();
    const clientRequests = this.requests.get(clientId) || [];

    // Remove requests outside the time window
    const validRequests = clientRequests.filter(
      timestamp => now - timestamp < this.windowMs
    );

    if (validRequests.length >= this.maxRequests) {
      Logger.warn('Rate limit exceeded', { clientId, requests: validRequests.length });
      throw new RateLimitError(`Too many requests. Limit: ${this.maxRequests} per ${this.windowMs}ms`);
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(clientId, validRequests);

    return true;
  }

  /**
   * Get current request count for a client
   * @param {string} clientId - Client identifier
   * @returns {number} Number of requests in current window
   */
  getRequestCount(clientId) {
    const now = Date.now();
    const clientRequests = this.requests.get(clientId) || [];
    return clientRequests.filter(timestamp => now - timestamp < this.windowMs).length;
  }

  /**
   * Start periodic cleanup of old entries
   * @private
   */
  startCleanup() {
    if (this.cleanupInterval) return;
    
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [clientId, timestamps] of this.requests.entries()) {
        const validRequests = timestamps.filter(
          timestamp => now - timestamp < this.windowMs
        );
        if (validRequests.length === 0) {
          this.requests.delete(clientId);
        } else {
          this.requests.set(clientId, validRequests);
        }
      }
    }, this.windowMs);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Reset rate limiter
   */
  reset() {
    this.requests.clear();
  }
}

/**
 * Validate and sanitize file path
 * @param {string} filePath - File path to validate
 * @returns {string} Sanitized file path
 * @throws {ValidationError} If path is invalid
 */
export function validateFilePath(filePath) {
  // Check if file path is provided
  if (typeof filePath !== 'string' || !filePath) {
    throw new ValidationError('Query parameter "file" is required.');
  }

  // Sanitize path: normalize, remove leading/trailing slashes
  const safePath = path.posix.normalize(filePath.trim().replace(/^\/+|\/+$/, ''));

  // Prevent directory traversal
  if (safePath.startsWith('..') || safePath.includes('/..')) {
    Logger.warn('Directory traversal attempt detected', { filePath });
    throw new ValidationError('Invalid file path (directory traversal attempt detected).');
  }

  // Check for empty or current directory reference
  if (!safePath || safePath === '.') {
    throw new ValidationError('Invalid or empty file path specified.');
  }

  // Additional checks for suspicious patterns
  if (safePath.includes('\0')) {
    throw new ValidationError('Invalid file path (null byte detected).');
  }

  return safePath;
}

/**
 * Get client identifier from request
 * @param {Object} req - Request object
 * @returns {string} Client identifier
 */
export function getClientId(req) {
  // Try to get real IP from various headers (Vercel/proxy headers)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }

  // Fallback to connection remote address
  return req.connection?.remoteAddress || 
         req.socket?.remoteAddress || 
         'unknown';
}

/**
 * Validate HTTP method
 * @param {string} method - HTTP method
 * @param {string[]} allowedMethods - Array of allowed methods
 * @throws {ValidationError} If method is not allowed
 */
export function validateMethod(method, allowedMethods = ['GET']) {
  if (!allowedMethods.includes(method)) {
    throw new ValidationError(`Method ${method} not allowed. Allowed methods: ${allowedMethods.join(', ')}`);
  }
}

/**
 * Generate ETag from content
 * @param {Buffer} contentBuffer - Content buffer
 * @returns {string} ETag hash
 */
export function generateETag(contentBuffer) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(contentBuffer).digest('hex');
}

/**
 * Security headers configuration
 * @type {Object.<string, string>}
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'X-XSS-Protection': '1; mode=block',
};

/**
 * Apply security headers to response
 * @param {Object} res - Response object
 */
export function applySecurityHeaders(res) {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(header, value);
  }
}
