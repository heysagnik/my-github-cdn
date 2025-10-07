# CDN Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Request                           │
│                  GET /api/cdn?file=path/to/file                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Main Handler (api/cdn.js)                   │
│  - Orchestrates all services                                     │
│  - Minimal business logic                                        │
│  - Clean, readable code                                          │
└──┬──────────────────────────────────────────────────────────┬───┘
   │                                                           │
   ▼                                                           ▼
┌─────────────────────┐                            ┌──────────────────┐
│  Security Module    │                            │  Logger Module   │
│  (lib/security.js)  │                            │  (lib/logger.js) │
│                     │                            │                  │
│  - Validate path    │◄──────────────────────────►│  - Request logs  │
│  - Rate limiting    │                            │  - Error logs    │
│  - Generate ETag    │                            │  - Debug info    │
│  - Apply headers    │                            │  - Timestamps    │
└──────────┬──────────┘                            └──────────────────┘
           │
           ▼
┌─────────────────────┐
│   Cache Module      │
│   (lib/cache.js)    │
│                     │
│  ┌───────────────┐  │
│  │  LRU Cache    │  │───► Cache Hit? → Return cached data
│  │  - Size limit │  │
│  │  - Entry limit│  │
│  └───────────────┘  │
└──────────┬──────────┘
           │ Cache Miss
           ▼
┌─────────────────────┐
│  GitHub Client      │
│  (lib/github-      │
│   client.js)        │
│                     │
│  ┌───────────────┐  │
│  │ Fetch from    │  │
│  │ GitHub        │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │ Retry Logic   │  │───► Success → Store in cache
│  │ - Exponential │  │
│  │   backoff     │  │───► Failure → Throw error
│  └───────────────┘  │
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  MIME Types Module  │
│  (lib/mime-types.js)│
│                     │
│  - Detect type      │
│  - Check compress?  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Compression Module  │
│ (lib/compression.js)│
│                     │
│  ┌───────────────┐  │
│  │ Try Brotli    │  │───► Best compression
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │ Try Gzip      │  │───► Fallback
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │ Try Deflate   │  │───► Last resort
│  └───────────────┘  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Response Handler    │
│ (lib/response-     │
│  handler.js)        │
│                     │
│  - Set headers      │
│  - Send content     │
│  - Format errors    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Response to Client                       │
│  - Status: 200 OK / 304 Not Modified / 404 Not Found           │
│  - Headers: Content-Type, ETag, Cache-Control, etc.            │
│  - Body: File content (possibly compressed)                    │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Request Handling
```
Client → Handler → Security Validation → Rate Limit Check
```

### 2. Cache Flow
```
Handler → Cache.get() → Hit? → Return cached data
                      ↓ Miss
                GitHub Client → Retry Logic → Fetch
                      ↓
                Cache.set() → Return fresh data
```

### 3. Response Flow
```
Data → MIME Detection → Compression Check → Compress?
                                           ↓ Yes
                                    Compression Service
                                           ↓
                            Response Handler → Client
```

## Module Dependencies

```
api/cdn.js (Main Handler)
    ├── lib/config.js (Configuration)
    │   └── Uses environment variables
    │
    ├── lib/logger.js (Logging)
    │   └── No dependencies
    │
    ├── lib/errors.js (Error Classes)
    │   └── No dependencies
    │
    ├── lib/cache.js (LRU Cache)
    │   └── lib/logger.js
    │
    ├── lib/github-client.js (GitHub API)
    │   ├── node-fetch
    │   ├── lib/errors.js
    │   └── lib/logger.js
    │
    ├── lib/mime-types.js (MIME Detection)
    │   └── path (Node.js built-in)
    │
    ├── lib/compression.js (Compression)
    │   ├── zlib (Node.js built-in)
    │   ├── lib/logger.js
    │   └── lib/errors.js
    │
    ├── lib/security.js (Security)
    │   ├── path (Node.js built-in)
    │   ├── crypto (Node.js built-in)
    │   ├── lib/errors.js
    │   └── lib/logger.js
    │
    └── lib/response-handler.js (Responses)
        ├── lib/logger.js
        └── lib/errors.js
```

## Component Responsibilities

### api/cdn.js (Main Handler)
**Role:** Request orchestration  
**Responsibilities:**
- Receive HTTP requests
- Coordinate between modules
- Handle business logic flow
- Return HTTP responses

**Does NOT:**
- Validate inputs (delegates to security)
- Manage cache (delegates to cache module)
- Fetch from GitHub (delegates to client)
- Handle compression (delegates to compression)

### lib/config.js
**Role:** Configuration management  
**Responsibilities:**
- Load environment variables
- Validate configuration
- Provide defaults
- Export config object

### lib/errors.js
**Role:** Error definitions  
**Responsibilities:**
- Define custom error types
- Standardize error structure
- Provide error codes
- Enable typed error handling

### lib/cache.js
**Role:** Cache management  
**Responsibilities:**
- Store/retrieve cached files
- Implement LRU eviction
- Enforce size limits
- Track cache statistics

### lib/github-client.js
**Role:** GitHub API communication  
**Responsibilities:**
- Fetch files from GitHub
- Handle API errors
- Implement retry logic
- Manage timeouts

### lib/mime-types.js
**Role:** Content type detection  
**Responsibilities:**
- Detect MIME types
- Map file extensions
- Check compressibility
- Provide charset info

### lib/compression.js
**Role:** Content compression  
**Responsibilities:**
- Compress content
- Select best algorithm
- Handle compression errors
- Calculate compression ratios

### lib/security.js
**Role:** Security features  
**Responsibilities:**
- Validate file paths
- Implement rate limiting
- Generate ETags
- Apply security headers

### lib/logger.js
**Role:** Application logging  
**Responsibilities:**
- Log at different levels
- Structure log messages
- Add timestamps
- Include metadata

### lib/response-handler.js
**Role:** HTTP response formatting  
**Responsibilities:**
- Format success responses
- Format error responses
- Set HTTP headers
- Handle caching headers

## Design Principles

### 1. Single Responsibility
Each module has one clear purpose.

### 2. Separation of Concerns
Business logic separated from infrastructure code.

### 3. Dependency Injection
Dependencies passed as parameters, not hardcoded.

### 4. Error Handling
Errors bubble up with context, handled at appropriate level.

### 5. Testability
Modules can be tested in isolation.

### 6. Documentation
JSDoc comments on every function.

## Performance Characteristics

### Cache Performance
- **Hit Rate:** Depends on traffic patterns
- **Storage:** O(1) lookup, O(1) insertion
- **Eviction:** O(1) (LRU via Map ordering)
- **Memory:** Bounded by maxCacheSizeBytes

### Compression Performance
- **Brotli:** Best compression (~70%), slower
- **Gzip:** Good compression (~60%), fast
- **Deflate:** Fair compression (~55%), fastest

### Rate Limiting Performance
- **Check:** O(n) where n = requests in window
- **Cleanup:** Periodic, O(m) where m = unique clients
- **Memory:** O(m * n) in worst case

## Scalability Considerations

### Current Architecture (Serverless)
- ✅ Automatic scaling with Vercel
- ✅ No server management
- ⚠️ In-memory cache per instance
- ⚠️ Rate limiting per instance

### For High Traffic
Consider adding:
1. **Redis Cache** - Shared cache across instances
2. **CDN Layer** - Cloudflare/Fastly in front
3. **Distributed Rate Limiting** - Redis-based limiter
4. **Metrics** - Prometheus/Grafana monitoring

## Security Model

### Input Validation
```
Request → Path validation → Traversal check → Method check
```

### Rate Limiting
```
Request → Extract client IP → Check limit → Allow/Deny
```

### Content Security
```
Response → Security headers → ETag → HTTPS only
```

### Error Handling
```
Error → Log (sanitized) → Return (safe message) → No stack traces
```

## Monitoring & Observability

### Logs
- Request logs (INFO level)
- Error logs (ERROR level)
- Cache events (DEBUG level)
- Performance metrics (INFO level)

### Metrics (Future)
- Cache hit rate
- Compression ratio
- Response times
- Error rates
- Rate limit hits

### Health Checks (Future)
- GitHub API connectivity
- Cache health
- Memory usage

## Future Enhancements

### Phase 1: Testing
- Unit tests for each module
- Integration tests
- Performance benchmarks

### Phase 2: Observability
- Metrics endpoint
- Health check endpoint
- Distributed tracing

### Phase 3: Scaling
- Redis cache
- Distributed rate limiting
- CDN integration

### Phase 4: Features
- Multi-branch support
- Private repository support
- Image optimization
- Video streaming

## Deployment Architecture

```
Developer → GitHub → Vercel → Production

┌──────────┐     ┌──────────┐     ┌──────────────┐
│  GitHub  │────►│  Vercel  │────►│  Production  │
│   Repo   │     │  Build   │     │   Instances  │
└──────────┘     └──────────┘     └──────────────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │  GitHub API │
                                   │   (Source)  │
                                   └─────────────┘
```

### Vercel Benefits
- Automatic deployments
- Edge network (global)
- HTTPS by default
- Environment variables
- Serverless scaling

---

**Architecture Version:** 2.0.0  
**Last Updated:** October 2025  
**Maintainer:** Architecture documentation
