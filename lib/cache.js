/**
 * LRU Cache Manager Module
 * Implements Least Recently Used cache with size limits
 * @module lib/cache
 */

import { Logger } from './logger.js';

/**
 * Cache entry
 * @typedef {Object} CacheEntry
 * @property {Buffer} data - Cached data buffer
 * @property {number} expiresAt - Expiration timestamp
 * @property {number} size - Size of cached data in bytes
 * @property {number} accessedAt - Last access timestamp
 */

/**
 * LRU Cache implementation with size and count limits
 */
export class LRUCache {
  /**
   * Creates an LRU Cache
   * @param {number} maxSizeBytes - Maximum total cache size in bytes
   * @param {number} maxEntries - Maximum number of cache entries
   * @param {number} ttlSeconds - Time to live for cache entries in seconds
   */
  constructor(maxSizeBytes, maxEntries, ttlSeconds) {
    /** @type {Map<string, CacheEntry>} */
    this.cache = new Map();
    this.maxSizeBytes = maxSizeBytes;
    this.maxEntries = maxEntries;
    this.ttlSeconds = ttlSeconds;
    this.currentSizeBytes = 0;
  }

  /**
   * Get an item from cache
   * @param {string} key - Cache key
   * @returns {Buffer|null} Cached data or null if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() >= entry.expiresAt) {
      this.delete(key);
      return null;
    }

    // Update access time for LRU
    entry.accessedAt = Date.now();
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    Logger.cacheHit(key);
    return entry.data;
  }

  /**
   * Set an item in cache
   * @param {string} key - Cache key
   * @param {Buffer} data - Data to cache
   * @returns {boolean} True if successfully cached
   */
  set(key, data) {
    const size = Buffer.byteLength(data);
    
    // Don't cache if single item exceeds max size
    if (size > this.maxSizeBytes) {
      Logger.warn(`Item too large to cache: ${key}`, { size });
      return false;
    }

    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Evict entries until there's space
    while (
      this.currentSizeBytes + size > this.maxSizeBytes ||
      this.cache.size >= this.maxEntries
    ) {
      this.evictLRU();
    }

    const entry = {
      data,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
      size,
      accessedAt: Date.now(),
    };

    this.cache.set(key, entry);
    this.currentSizeBytes += size;

    Logger.debug(`Cached item: ${key}`, { size });
    return true;
  }

  /**
   * Delete an item from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if item was deleted
   */
  delete(key) {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSizeBytes -= entry.size;
      this.cache.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Evict the least recently used item
   * @private
   */
  evictLRU() {
    if (this.cache.size === 0) return;

    // First entry is the least recently used (Map maintains insertion order)
    const firstKey = this.cache.keys().next().value;
    const entry = this.cache.get(firstKey);
    
    Logger.debug(`Evicting LRU item: ${firstKey}`, { size: entry.size });
    this.delete(firstKey);
  }

  /**
   * Clear all expired entries
   * @returns {number} Number of entries cleared
   */
  clearExpired() {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      Logger.debug(`Cleared ${cleared} expired cache entries`);
    }

    return cleared;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.currentSizeBytes = 0;
    Logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      entries: this.cache.size,
      sizeBytes: this.currentSizeBytes,
      maxSizeBytes: this.maxSizeBytes,
      maxEntries: this.maxEntries,
      utilizationPercent: ((this.currentSizeBytes / this.maxSizeBytes) * 100).toFixed(2),
    };
  }
}
