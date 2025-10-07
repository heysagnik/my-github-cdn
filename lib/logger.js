/**
 * Structured Logging Module
 * Provides consistent logging functionality
 * @module lib/logger
 */

/**
 * Log levels
 * @enum {string}
 */
const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

/**
 * Current log level (can be set via environment variable)
 * @type {string}
 */
const currentLogLevel = process.env.LOG_LEVEL || 'INFO';

/**
 * Map log levels to numeric priorities
 * @type {Object.<string, number>}
 */
const levelPriorities = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Check if a log level should be logged based on current configuration
 * @param {string} level - Log level to check
 * @returns {boolean} True if the level should be logged
 */
function shouldLog(level) {
  return levelPriorities[level] >= levelPriorities[currentLogLevel];
}

/**
 * Format log message with timestamp and metadata
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} [metadata] - Additional metadata
 * @returns {string} Formatted log message
 */
function formatLogMessage(level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

/**
 * Logger class for structured logging
 */
export class Logger {
  /**
   * Log a debug message
   * @param {string} message - Log message
   * @param {Object} [metadata] - Additional metadata
   */
  static debug(message, metadata = {}) {
    if (shouldLog(LogLevel.DEBUG)) {
      console.log(formatLogMessage(LogLevel.DEBUG, message, metadata));
    }
  }

  /**
   * Log an info message
   * @param {string} message - Log message
   * @param {Object} [metadata] - Additional metadata
   */
  static info(message, metadata = {}) {
    if (shouldLog(LogLevel.INFO)) {
      console.log(formatLogMessage(LogLevel.INFO, message, metadata));
    }
  }

  /**
   * Log a warning message
   * @param {string} message - Log message
   * @param {Object} [metadata] - Additional metadata
   */
  static warn(message, metadata = {}) {
    if (shouldLog(LogLevel.WARN)) {
      console.warn(formatLogMessage(LogLevel.WARN, message, metadata));
    }
  }

  /**
   * Log an error message
   * @param {string} message - Log message
   * @param {Error|Object} [error] - Error object or metadata
   */
  static error(message, error = {}) {
    if (shouldLog(LogLevel.ERROR)) {
      const metadata = error instanceof Error 
        ? { errorMessage: error.message, stack: error.stack }
        : error;
      console.error(formatLogMessage(LogLevel.ERROR, message, metadata));
    }
  }

  /**
   * Log cache hit event
   * @param {string} path - File path
   */
  static cacheHit(path) {
    this.debug(`Cache HIT: ${path}`);
  }

  /**
   * Log cache miss event
   * @param {string} path - File path
   */
  static cacheMiss(path) {
    this.debug(`Cache MISS: ${path}, fetching from GitHub...`);
  }

  /**
   * Log request event
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @param {string} [clientIp] - Client IP address
   */
  static request(method, path, clientIp = 'unknown') {
    this.info(`Request: ${method} ${path}`, { clientIp });
  }

  /**
   * Log response event
   * @param {string} path - Request path
   * @param {number} statusCode - HTTP status code
   * @param {number} [responseTime] - Response time in milliseconds
   */
  static response(path, statusCode, responseTime = null) {
    const metadata = responseTime !== null ? { responseTime: `${responseTime}ms` } : {};
    this.info(`Response: ${statusCode} for ${path}`, metadata);
  }
}
