# CDN Library Modules

This directory contains modular, reusable components for the GitHub CDN service.

## Architecture Overview

The CDN is built with a modular architecture following best practices:

```
lib/
├── config.js          - Configuration management with validation
├── errors.js          - Custom error classes for better error handling
├── cache.js           - LRU cache implementation with size limits
├── compression.js     - Content compression service
├── github-client.js   - GitHub API client with retry logic
├── mime-types.js      - MIME type detection utility
├── security.js        - Security utilities (rate limiting, validation)
├── logger.js          - Structured logging
└── response-handler.js - HTTP response utilities
```

## Modules

### config.js
Configuration module that loads and validates environment variables.

**Features:**
- Validates configuration on startup
- Provides sensible defaults
- Type checking and range validation
- Centralized configuration management

**Environment Variables:**
- `GITHUB_REPO_OWNER` - Repository owner (default: 'heysagnik')
- `GITHUB_REPO_NAME` - Repository name (default: 'my-github-cdn')
- `GITHUB_REPO_BRANCH` - Branch to serve from (default: 'main')
- `GITHUB_TOKEN` - Optional GitHub API token
- `CDN_SERVER_CACHE_SECONDS` - Server cache duration (default: 300)
- `CDN_CLIENT_CACHE_SECONDS` - Client cache duration (default: 3600)
- `CDN_MIN_COMPRESSION_SIZE_BYTES` - Min size for compression (default: 1024)
- `CDN_MAX_CACHE_SIZE_BYTES` - Max cache size (default: 104857600)
- `CDN_MAX_CACHE_ENTRIES` - Max cache entries (default: 1000)
- `LOG_LEVEL` - Logging level (default: 'INFO')

### errors.js
Custom error classes for better error handling and debugging.

**Error Classes:**
- `CDNError` - Base error class
- `FileNotFoundError` - File not found (404)
- `GitHubAPIError` - GitHub API failures
- `ValidationError` - Request validation failures
- `RateLimitError` - Rate limit exceeded
- `CompressionError` - Compression failures

### cache.js
LRU (Least Recently Used) cache implementation with size and entry limits.

**Features:**
- Automatic eviction of least recently used items
- Size-based limits (total bytes)
- Entry count limits
- Automatic expiration
- Cache statistics

**Methods:**
- `get(key)` - Retrieve cached item
- `set(key, data)` - Store item in cache
- `delete(key)` - Remove item from cache
- `clearExpired()` - Remove expired entries
- `clear()` - Clear all entries
- `getStats()` - Get cache statistics

### compression.js
Content compression service supporting multiple algorithms.

**Features:**
- Brotli compression (preferred)
- Gzip compression (fallback)
- Deflate compression (fallback)
- Automatic algorithm selection based on Accept-Encoding
- Only compresses if beneficial (smaller than original)

**Methods:**
- `compressContent(buffer, acceptEncoding, options)` - Compress content
- `shouldCompress(contentType, contentSize, minSize, isCompressibleFn)` - Check if compression should be attempted

### github-client.js
GitHub API client with automatic retry logic and error handling.

**Features:**
- Exponential backoff retry logic
- Configurable retry attempts (default: 3)
- Request timeout handling
- Automatic rate limit handling
- Custom error types

**Methods:**
- `fetchFile(filePath)` - Fetch file from GitHub
- `fileExists(filePath)` - Check if file exists

### mime-types.js
MIME type detection and content type utilities.

**Features:**
- Comprehensive MIME type mapping
- Charset specification for text types
- Compression eligibility detection

**Methods:**
- `getMimeType(filePath)` - Get MIME type for file
- `isCompressible(contentType)` - Check if content type is compressible
- `getAllMimeTypes()` - Get all supported MIME types
- `isSupportedExtension(extension)` - Check if extension is supported

### security.js
Security utilities including rate limiting, validation, and security headers.

**Features:**
- Rate limiting with sliding window
- Path validation and traversal prevention
- Client identification
- Security header management
- ETag generation

**Classes:**
- `RateLimiter` - Rate limiting implementation

**Methods:**
- `validateFilePath(filePath)` - Validate and sanitize file path
- `validateMethod(method, allowedMethods)` - Validate HTTP method
- `getClientId(req)` - Extract client identifier
- `generateETag(contentBuffer)` - Generate ETag hash
- `applySecurityHeaders(res)` - Apply security headers to response

### logger.js
Structured logging with multiple log levels.

**Features:**
- Multiple log levels (DEBUG, INFO, WARN, ERROR)
- Structured logging with metadata
- Timestamp inclusion
- Configurable via LOG_LEVEL environment variable

**Methods:**
- `Logger.debug(message, metadata)` - Debug logging
- `Logger.info(message, metadata)` - Info logging
- `Logger.warn(message, metadata)` - Warning logging
- `Logger.error(message, error)` - Error logging
- `Logger.cacheHit(path)` - Log cache hit
- `Logger.cacheMiss(path)` - Log cache miss
- `Logger.request(method, path, clientIp)` - Log request
- `Logger.response(path, statusCode, responseTime)` - Log response

### response-handler.js
HTTP response handling utilities.

**Features:**
- Standardized response formats
- ETag validation
- CORS header support
- Error response formatting

**Methods:**
- `sendContent(res, content, options)` - Send successful response
- `sendNotModified(res)` - Send 304 Not Modified
- `sendError(res, error, path)` - Send error response
- `sendMethodNotAllowed(res, allowedMethods)` - Send 405 response
- `hasValidCache(req, etag)` - Check if client cache is fresh
- `setCORSHeaders(res, origin)` - Set CORS headers
- `handleOptionsRequest(res)` - Handle OPTIONS request

## Usage Example

```javascript
import { config } from './lib/config.js';
import { Logger } from './lib/logger.js';
import { LRUCache } from './lib/cache.js';
import { GitHubClient } from './lib/github-client.js';

// Initialize services
const cache = new LRUCache(
  config.maxCacheSizeBytes,
  config.maxCacheEntries,
  config.serverCacheSeconds
);

const githubClient = new GitHubClient({
  rawBaseUrl: config.githubRawBaseUrl,
  userAgent: config.userAgent,
  token: config.githubToken,
});

// Fetch with caching
async function fetchFile(path) {
  const cached = cache.get(path);
  if (cached) {
    Logger.cacheHit(path);
    return cached;
  }
  
  Logger.cacheMiss(path);
  const buffer = await githubClient.fetchFile(path);
  cache.set(path, buffer);
  return buffer;
}
```

## Best Practices

1. **Error Handling**: Always use custom error classes for better error context
2. **Logging**: Use structured logging with appropriate log levels
3. **Caching**: Configure cache limits based on your deployment environment
4. **Security**: Always validate inputs and apply security headers
5. **Compression**: Let the compression service handle algorithm selection
6. **Configuration**: Use environment variables for all configurable values

## Testing

The library modules are designed to be easily testable. Each module is independent and can be tested in isolation.

```javascript
// Example test
import { validateFilePath } from './lib/security.js';

try {
  const safe = validateFilePath('../../../etc/passwd');
  console.log('Should not reach here');
} catch (error) {
  console.log('Correctly blocked traversal attempt');
}
```

## Performance Considerations

- **LRU Cache**: Keeps hot files in memory for fast access
- **Compression**: Only applies when beneficial (smaller than original)
- **Rate Limiting**: Protects against abuse with minimal overhead
- **Retry Logic**: Automatic retry with exponential backoff for resilience

## Maintenance

All modules include comprehensive JSDoc documentation. Use an IDE with JSDoc support for inline documentation and type hints.

To view documentation:
```bash
# Generate HTML documentation (requires jsdoc)
npm install -g jsdoc
jsdoc lib/*.js -d docs
```
