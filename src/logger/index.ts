import pino from 'pino';
import { getCurrentTraceContext } from '../core/trace-context';

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /**
   * Service name (will be included in all logs)
   */
  service: string;

  /**
   * Bounded context name (optional, for domain-driven design)
   */
  boundedContext?: string;

  /**
   * Log level (default: 'info' or LOG_LEVEL env var)
   */
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

  /**
   * Environment (default: NODE_ENV or 'development')
   */
  environment?: string;

  /**
   * Enable pretty printing (default: true in development, false in production)
   */
  prettyPrint?: boolean;

  /**
   * Additional base fields to include in all logs
   */
  base?: Record<string, unknown>;

  /**
   * Custom serializers for specific fields
   */
  serializers?: Record<string, pino.SerializerFn>;
}

/**
 * Create a Pino logger with automatic trace context injection
 * 
 * The logger automatically enriches every log with:
 * - traceId: OpenTelemetry trace ID from active span
 * - spanId: OpenTelemetry span ID from active span
 * - correlationId: Correlation ID from AsyncLocalStorage
 * - eventId: Event ID (for Service Bus messages)
 * - eventType: Event type (for Service Bus messages)
 * - userId: User ID (if set in context)
 * - service: Service name
 * - env: Environment
 * 
 * All logs are output in JSON format (except in development with prettyPrint enabled).
 * This is optimal for Datadog log ingestion.
 * 
 * @param options - Logger configuration
 * @returns Configured Pino logger instance
 * 
 * @example
 * ```typescript
 * import { createLogger } from '@kozy/tracing/logger';
 * 
 * export const logger = createLogger({
 *   service: 'notifications-api',
 *   boundedContext: 'notifications',
 *   level: 'info',
 * });
 * 
 * // Usage
 * logger.info('User created', { userId: '123', email: 'user@example.com' });
 * logger.error('Failed to send email', { error: err.message, userId: '123' });
 * ```
 */
export function createLogger(options: LoggerOptions): pino.Logger {
  const {
    service,
    boundedContext,
    level = (process.env.LOG_LEVEL as pino.Level) || 'info',
    environment = process.env.NODE_ENV || 'development',
    prettyPrint = environment === 'development' && process.env.LOG_FORMAT !== 'json',
    base = {},
    serializers = {},
  } = options;

  // Base configuration
  const baseConfig: pino.LoggerOptions = {
    level,
    base: {
      service,
      ...(boundedContext && { boundedContext }),
      env: environment,
      ...base,
    },
    // Mixin to automatically inject trace context into every log
    mixin() {
      const traceContext = getCurrentTraceContext();
      return {
        ...(traceContext.traceId && { traceId: traceContext.traceId }),
        ...(traceContext.spanId && { spanId: traceContext.spanId }),
        ...(traceContext.correlationId && { correlationId: traceContext.correlationId }),
        ...(traceContext.eventId && { eventId: traceContext.eventId }),
        ...(traceContext.eventType && { eventType: traceContext.eventType }),
        ...(traceContext.userId && { userId: traceContext.userId }),
        ...(traceContext.requestId && { requestId: traceContext.requestId }),
      };
    },
    formatters: {
      level: (label: string) => {
        return { level: label };
      },
    },
    serializers: {
      // Standard Pino error serializer
      err: pino.stdSerializers.err,
      // Enhanced error serializer for custom error fields
      error: (error: Error | unknown) => {
        if (error instanceof Error) {
          return {
            type: error.name,
            message: error.message,
            stack: error.stack?.split('\n').map((line) => line.trim()),
            // Include common error properties
            ...(('code' in error) && { code: (error as { code: unknown }).code }),
            ...(('statusCode' in error) && { statusCode: (error as { statusCode: unknown }).statusCode }),
            ...(('details' in error) && { details: (error as { details: unknown }).details }),
          };
        }
        return error;
      },
      ...serializers,
    },
    // Timestamp in ISO format for Datadog
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // Enable pretty printing for development
  if (prettyPrint) {
    baseConfig.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
        messageFormat:
          '[{service}]{if boundedContext}[{boundedContext}]{end}{if traceId} [trace:{traceId}]{end}{if correlationId} [corr:{correlationId}]{end} {msg}',
        levelFirst: true,
      },
    };
  }

  return pino(baseConfig);
}

/**
 * Default logger instance
 * 
 * You can use this directly, but it's recommended to create your own logger
 * with createLogger() so you can specify the service name.
 */
export const logger = createLogger({
  service: process.env.SERVICE_NAME || 'unknown-service',
});

/**
 * Create a child logger with additional context
 * 
 * Child loggers inherit all configuration from parent and add additional bindings.
 * 
 * @param parentLogger - Parent logger instance
 * @param bindings - Additional fields to include in all logs from this child
 * @returns Child logger
 * 
 * @example
 * ```typescript
 * const logger = createLogger({ service: 'api' });
 * 
 * function handleUser(userId: string) {
 *   const userLogger = createChildLogger(logger, { userId });
 *   
 *   userLogger.info('Processing user');
 *   // Log includes: { service: 'api', userId: '123', ... }
 * }
 * ```
 */
export function createChildLogger(
  parentLogger: pino.Logger,
  bindings: Record<string, unknown>
): pino.Logger {
  return parentLogger.child(bindings);
}
