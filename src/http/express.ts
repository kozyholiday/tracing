import type { Request, Response, NextFunction, ErrorRequestHandler, RequestHandler } from 'express';
import {
  getCurrentTraceContext,
  setTraceContext,
  extractCorrelationId,
  generateCorrelationId,
  extractTraceIdFromTraceparent,
} from '../core/trace-context';
import { recordException, setSpanStatus, addSpanAttributes } from '../core/span-utils';
import { SpanStatusCode } from '@opentelemetry/api';

/**
 * Configuration options for Express tracing middleware
 */
export interface TracingMiddlewareOptions {
  /**
   * Header name for correlation ID (default: 'x-correlation-id')
   */
  correlationIdHeader?: string;

  /**
   * Generate new correlation ID if not present in request (default: true)
   */
  generateCorrelationId?: boolean;

  /**
   * Add correlation ID to response headers (default: true)
   */
  addCorrelationIdToResponse?: boolean;

  /**
   * Add trace ID to response headers (default: true)
   */
  addTraceIdToResponse?: boolean;

  /**
   * Extract user ID from request (custom function)
   * @example (req) => req.user?.id
   */
  extractUserId?: (req: Request) => string | undefined;

  /**
   * Additional span attributes to add
   */
  additionalAttributes?: (req: Request) => Record<string, string | number | boolean>;
}

/**
 * Create Express middleware for distributed tracing
 * 
 * This middleware:
 * 1. Extracts or generates correlation ID
 * 2. Extracts trace context from headers (W3C traceparent)
 * 3. Sets trace context in AsyncLocalStorage
 * 4. Adds correlation ID and trace ID to response headers
 * 5. Enriches OpenTelemetry span with request metadata
 * 
 * Note: The actual span creation is handled by OpenTelemetry's auto-instrumentation.
 * This middleware enhances the span with additional context.
 * 
 * @param options - Middleware configuration options
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * import express from 'express';
 * import { createTracingMiddleware } from '@kozy/tracing/express';
 * 
 * const app = express();
 * 
 * app.use(createTracingMiddleware({
 *   extractUserId: (req) => req.user?.id,
 *   additionalAttributes: (req) => ({
 *     'tenant.id': req.tenant?.id,
 *   }),
 * }));
 * ```
 */
export function createTracingMiddleware(
  options: TracingMiddlewareOptions = {}
): RequestHandler {
  const {
    correlationIdHeader = 'x-correlation-id',
    generateCorrelationId: shouldGenerateCorrelationId = true,
    addCorrelationIdToResponse = true,
    addTraceIdToResponse = true,
    extractUserId,
    additionalAttributes,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Extract or generate correlation ID
    let correlationId = extractCorrelationId(req.headers as Record<string, string | string[] | undefined>);
    
    if (!correlationId && shouldGenerateCorrelationId) {
      correlationId = generateCorrelationId();
    }

    // Extract trace ID from W3C traceparent header
    const traceId = extractTraceIdFromTraceparent(req.headers.traceparent as string);

    // Extract user ID if configured
    const userId = extractUserId ? extractUserId(req) : undefined;

    // Generate request ID (unique per request)
    const requestId = generateCorrelationId();

    // Set trace context in AsyncLocalStorage
    setTraceContext({
      correlationId,
      traceId,
      userId,
      requestId,
    });

    // Add correlation ID to response header
    if (correlationId && addCorrelationIdToResponse) {
      res.setHeader(correlationIdHeader, correlationId);
    }

    // Add request ID to response header
    res.setHeader('x-request-id', requestId);

    // Get current trace context (now includes traceId from active span if available)
    const context = getCurrentTraceContext();

    // Add trace ID to response header
    if (context.traceId && addTraceIdToResponse) {
      res.setHeader('x-trace-id', context.traceId);
    }

    // Enrich OpenTelemetry span with request metadata
    const spanAttributes: Record<string, string | number | boolean> = {
      'http.request.method': req.method,
      'http.request.path': req.path,
      'http.request.route': req.route?.path || req.path,
      'http.request.query': req.url.includes('?') ? req.url.split('?')[1] : '',
    };

    if (correlationId) {
      spanAttributes['correlation.id'] = correlationId;
    }

    if (requestId) {
      spanAttributes['request.id'] = requestId;
    }

    if (userId) {
      spanAttributes['user.id'] = userId;
    }

    if (req.ip) {
      spanAttributes['client.ip'] = req.ip;
    }

    if (req.headers['user-agent']) {
      spanAttributes['user_agent.original'] = req.headers['user-agent'];
    }

    // Add additional custom attributes
    if (additionalAttributes) {
      Object.assign(spanAttributes, additionalAttributes(req));
    }

    addSpanAttributes(spanAttributes);

    // Capture response status code when response finishes
    res.on('finish', () => {
      addSpanAttributes({
        'http.response.status_code': res.statusCode,
      });

      // Set span status based on HTTP status code
      if (res.statusCode >= 500) {
        setSpanStatus(SpanStatusCode.ERROR, `HTTP ${res.statusCode}`);
      } else if (res.statusCode >= 400) {
        // Client errors are not span errors
        setSpanStatus(SpanStatusCode.OK);
      } else {
        setSpanStatus(SpanStatusCode.OK);
      }
    });

    next();
  };
}

/**
 * Configuration options for Express error middleware
 */
export interface ErrorMiddlewareOptions {
  /**
   * Log errors (default: true)
   */
  logErrors?: boolean;

  /**
   * Include error stack in response (default: false in production)
   */
  includeStack?: boolean;

  /**
   * Custom error response formatter
   */
  formatError?: (error: Error, req: Request) => Record<string, unknown>;

  /**
   * Custom logger function
   */
  logger?: {
    error: (message: string, context?: Record<string, unknown>) => void;
  };
}

/**
 * Create Express error handling middleware
 * 
 * This middleware:
 * 1. Records exception on active OpenTelemetry span
 * 2. Sets span status to ERROR
 * 3. Logs error with trace context
 * 4. Returns standardized error response
 * 
 * IMPORTANT: This must be added AFTER all other middleware and routes.
 * 
 * @param options - Error middleware configuration options
 * @returns Express error middleware function
 * 
 * @example
 * ```typescript
 * import express from 'express';
 * import { createErrorMiddleware } from '@kozy/tracing/express';
 * import { logger } from '@kozy/tracing/logger';
 * 
 * const app = express();
 * 
 * // ... other middleware and routes ...
 * 
 * app.use(createErrorMiddleware({
 *   logger,
 *   includeStack: process.env.NODE_ENV !== 'production',
 * }));
 * ```
 */
export function createErrorMiddleware(
  options: ErrorMiddlewareOptions = {}
): ErrorRequestHandler {
  const {
    logErrors = true,
    includeStack = process.env.NODE_ENV !== 'production',
    formatError,
    logger,
  } = options;

  return (
    err: Error,
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: NextFunction
  ): void => {
    // Get trace context for logging
    const context = getCurrentTraceContext();

    // Record exception on OpenTelemetry span
    recordException(err, {
      'http.request.method': req.method,
      'http.request.path': req.path,
    });

    // Set span status to ERROR
    setSpanStatus(SpanStatusCode.ERROR, err.message);

    // Log error
    if (logErrors) {
      if (logger) {
        logger.error('Request error', {
          error: err.message,
          stack: err.stack,
          method: req.method,
          path: req.path,
          ...context,
        });
      } else {
        console.error('[Tracing Error]', {
          message: err.message,
          stack: err.stack,
          method: req.method,
          path: req.path,
          ...context,
        });
      }
    }

    // Determine status code
    const statusCode = (err as { statusCode?: number }).statusCode || 500;

    // Format error response
    let errorResponse: Record<string, unknown>;

    if (formatError) {
      errorResponse = formatError(err, req);
    } else {
      errorResponse = {
        error: {
          message: err.message,
          type: err.name,
          ...(includeStack && { stack: err.stack?.split('\n').map((line) => line.trim()) }),
          ...(context.correlationId && { correlationId: context.correlationId }),
          ...(context.traceId && { traceId: context.traceId }),
          ...(context.requestId && { requestId: context.requestId }),
        },
      };
    }

    // Send error response
    res.status(statusCode).json(errorResponse);
  };
}

/**
 * Async handler wrapper to catch errors in async route handlers
 * 
 * Express doesn't automatically catch errors in async functions,
 * so you need to use this wrapper or manually catch and pass to next().
 * 
 * @param fn - Async route handler
 * @returns Wrapped route handler
 * 
 * @example
 * ```typescript
 * import { asyncHandler } from '@kozy/tracing/express';
 * 
 * app.get('/users/:id', asyncHandler(async (req, res) => {
 *   const user = await userService.findById(req.params.id);
 *   res.json(user);
 * }));
 * ```
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
