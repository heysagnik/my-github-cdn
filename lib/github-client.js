/**
 * GitHub API Client Module
 * Handles GitHub API requests with retry logic and error handling
 * @module lib/github-client
 */

import fetch from 'node-fetch';
import { FileNotFoundError, GitHubAPIError } from './errors.js';
import { Logger } from './logger.js';

/**
 * GitHub client options
 * @typedef {Object} GitHubClientOptions
 * @property {string} rawBaseUrl - Base URL for raw GitHub content
 * @property {string} userAgent - User agent string
 * @property {string} [token] - Optional GitHub API token
 * @property {number} [maxRetries=3] - Maximum number of retry attempts
 * @property {number} [retryDelay=1000] - Initial retry delay in milliseconds
 * @property {number} [timeout=30000] - Request timeout in milliseconds
 */

/**
 * GitHub API Client with retry logic
 */
export class GitHubClient {
  /**
   * Creates a GitHub client
   * @param {GitHubClientOptions} options - Client options
   */
  constructor(options) {
    this.rawBaseUrl = options.rawBaseUrl;
    this.userAgent = options.userAgent;
    this.token = options.token;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout || 30000;
  }

  /**
   * Build headers for GitHub request
   * @returns {Object} Request headers
   * @private
   */
  buildHeaders() {
    const headers = {
      'User-Agent': this.userAgent,
      'Accept': 'application/vnd.github.v3.raw',
    };

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    return headers;
  }

  /**
   * Sleep for a specified duration
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   * @private
   */
  calculateBackoff(attempt) {
    return this.retryDelay * Math.pow(2, attempt);
  }

  /**
   * Check if error is retryable
   * @param {number} statusCode - HTTP status code
   * @returns {boolean} True if error is retryable
   * @private
   */
  isRetryableError(statusCode) {
    // Retry on server errors and rate limiting
    return statusCode >= 500 || statusCode === 429;
  }

  /**
   * Fetch file from GitHub with retry logic
   * @param {string} filePath - File path relative to repository root
   * @returns {Promise<Buffer>} File content as buffer
   * @throws {FileNotFoundError} If file is not found
   * @throws {GitHubAPIError} If GitHub API fails
   */
  async fetchFile(filePath) {
    const normalizedPath = filePath.replace(/^\/+/, '');
    const url = `${this.rawBaseUrl}/${normalizedPath}`;
    const headers = this.buildHeaders();

    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        Logger.debug(`Fetching from GitHub (attempt ${attempt + 1}/${this.maxRetries + 1})`, {
          url,
          path: normalizedPath,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle successful response
        if (response.ok) {
          const buffer = await response.buffer();
          Logger.debug(`Successfully fetched file from GitHub`, {
            path: normalizedPath,
            size: buffer.length,
          });
          return buffer;
        }

        // Handle 404 - not found (don't retry)
        if (response.status === 404) {
          Logger.warn('File not found in GitHub repository', { path: normalizedPath });
          throw new FileNotFoundError(normalizedPath);
        }

        // Handle other errors
        const errorText = await response.text();
        lastError = new GitHubAPIError(
          `GitHub fetch error for ${normalizedPath}: ${response.status} ${response.statusText}`,
          response.status === 404 ? 404 : 502,
          errorText.slice(0, 200)
        );

        // Check if we should retry
        if (!this.isRetryableError(response.status)) {
          throw lastError;
        }

        Logger.warn('GitHub request failed, will retry', {
          path: normalizedPath,
          status: response.status,
          attempt: attempt + 1,
        });

      } catch (error) {
        // Don't retry FileNotFoundError or non-retryable errors
        if (error instanceof FileNotFoundError) {
          throw error;
        }

        // Don't retry if this was the last attempt
        if (attempt === this.maxRetries) {
          if (error.name === 'AbortError') {
            throw new GitHubAPIError(
              `GitHub request timeout for ${normalizedPath}`,
              504,
              `Request exceeded ${this.timeout}ms timeout`
            );
          }
          throw lastError || error;
        }

        lastError = error;
        Logger.warn('GitHub request error, will retry', {
          path: normalizedPath,
          error: error.message,
          attempt: attempt + 1,
        });
      }

      // Wait before retrying (exponential backoff)
      if (attempt < this.maxRetries) {
        const delay = this.calculateBackoff(attempt);
        Logger.debug(`Waiting ${delay}ms before retry`);
        await this.sleep(delay);
      }
    }

    // If we get here, all retries failed
    throw lastError || new GitHubAPIError(
      `Failed to fetch ${normalizedPath} after ${this.maxRetries + 1} attempts`,
      502
    );
  }

  /**
   * Check if file exists in GitHub repository
   * @param {string} filePath - File path relative to repository root
   * @returns {Promise<boolean>} True if file exists
   */
  async fileExists(filePath) {
    try {
      await this.fetchFile(filePath);
      return true;
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}
