/**
 * @kozy/tracing - Core OpenTelemetry Tracing Package
 * 
 * Reusable tracing library for KozyHoliday microservices with Datadog APM integration.
 * Provides distributed tracing, correlation ID management, and observability for services
 * running on Azure AKS.
 */

export {
  initTracing,
  shutdownTracing,
  type TracingConfig,
} from './core/tracer';

export {
  getCurrentTraceContext,
  setTraceContext,
  runWithTraceContext,
  extractTraceIdFromTraceparent,
  extractCorrelationId,
  generateCorrelationId,
  extractTraceFromServiceBusMessage,
  injectTraceIntoServiceBusMessage,
  type TraceContext,
} from './core/trace-context';

export {
  withSpan,
  getCurrentSpan,
  addSpanAttribute,
  addSpanAttributes,
  addSpanEvent,
  recordException,
  setSpanStatus,
} from './core/span-utils';

// Re-export logger for convenience (for packages using classic moduleResolution)
export { createLogger, createChildLogger, logger, type LoggerOptions } from './logger';

// Re-export OpenTelemetry API for convenience
export { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
export type { Span, Tracer, Context } from '@opentelemetry/api';
