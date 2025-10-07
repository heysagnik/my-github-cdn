/**
 * Custom Error Classes
 * Provides specialized error types for better error handling
 * @module lib/errors
 */

/**
 * Base CDN Error class
 * @extends Error
 */
export class CDNError extends Error {
  /**
   * Creates a CDN Error
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} [code] - Error code for programmatic handling
   */
  constructor(message, statusCode = 500, code = 'CDN_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when a file is not found
 * @extends CDNError
 */
export class FileNotFoundError extends CDNError {
  /**
   * Creates a File Not Found Error
   * @param {string} filePath - The path of the missing file
   */
  constructor(filePath) {
    super(`File not found in repository: ${filePath}`, 404, 'ENOENT');
    this.filePath = filePath;
  }
}

/**
 * Error thrown when GitHub API fails
 * @extends CDNError
 */
export class GitHubAPIError extends CDNError {
  /**
   * Creates a GitHub API Error
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code from GitHub
   * @param {string} [details] - Additional error details
   */
  constructor(message, statusCode = 502, details = '') {
    super(message, statusCode, 'GITHUB_API_ERROR');
    this.details = details;
  }
}

/**
 * Error thrown when request validation fails
 * @extends CDNError
 */
export class ValidationError extends CDNError {
  /**
   * Creates a Validation Error
   * @param {string} message - Error message
   */
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

/**
 * Error thrown when rate limit is exceeded
 * @extends CDNError
 */
export class RateLimitError extends CDNError {
  /**
   * Creates a Rate Limit Error
   * @param {string} [message] - Error message
   */
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Error thrown when compression fails
 * @extends CDNError
 */
export class CompressionError extends CDNError {
  /**
   * Creates a Compression Error
   * @param {string} message - Error message
   * @param {Error} [originalError] - Original error that caused compression to fail
   */
  constructor(message, originalError = null) {
    super(message, 500, 'COMPRESSION_ERROR');
    this.originalError = originalError;
  }
}
