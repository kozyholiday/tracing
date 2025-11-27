import type { ServiceBusReceivedMessage } from '@azure/service-bus';
import {
  extractTraceFromServiceBusMessage,
  injectTraceIntoServiceBusMessage,
  runWithTraceContext,
  generateCorrelationId,
} from '../core/trace-context';
import { withSpan, recordException, setSpanStatus } from '../core/span-utils';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

/**
 * Message handler function type
 */
export type MessageHandler<T = unknown> = (
  message: ServiceBusReceivedMessage,
  context: MessageHandlerContext
) => Promise<T>;

/**
 * Context passed to message handlers
 */
export interface MessageHandlerContext {
  /**
   * Correlation ID for this message
   */
  correlationId?: string;

  /**
   * Trace ID for this message
   */
  traceId?: string;

  /**
   * Event ID (extracted from message properties)
   */
  eventId?: string;

  /**
   * Event type (extracted from message properties)
   */
  eventType?: string;

  /**
   * User ID (extracted from message properties)
   */
  userId?: string;
}

/**
 * Wrap Azure Service Bus message handler with distributed tracing
 * 
 * This wrapper:
 * 1. Extracts trace context from message properties (W3C traceparent)
 * 2. Creates a CONSUMER span linked to the producer span
 * 3. Sets trace context in AsyncLocalStorage
 * 4. Handles errors and records exceptions on the span
 * 5. Sets span status based on message processing result
 * 
 * @param handler - Message handler function
 * @param options - Handler configuration options
 * @returns Wrapped message handler
 * 
 * @example
 * ```typescript
 * import { withServiceBusTracing } from '@kozy/tracing/service-bus';
 * 
 * receiver.subscribe({
 *   processMessage: withServiceBusTracing(async (message, context) => {
 *     // Your message processing logic
 *     console.log('Processing:', message.body);
 *     console.log('Correlation ID:', context.correlationId);
 *   }),
 *   processError: async (args) => {
 *     console.error('Error:', args.error);
 *   }
 * });
 * ```
 */
export function withServiceBusTracing<T = unknown>(
  handler: MessageHandler<T>,
  options?: {
    /**
     * Custom span name (default: 'consume {eventType}' or 'consume message')
     */
    spanName?: string | ((message: ServiceBusReceivedMessage) => string);

    /**
     * Additional span attributes
     */
    additionalAttributes?: (message: ServiceBusReceivedMessage) => Record<string, string | number | boolean>;
  }
): MessageHandler<T> {
  return async (message: ServiceBusReceivedMessage): Promise<T> => {
    // Extract trace context from message properties
    const messageProps = message.applicationProperties || {};
    const traceContext = extractTraceFromServiceBusMessage(messageProps);

    // Generate correlation ID if not present
    if (!traceContext.correlationId) {
      traceContext.correlationId = generateCorrelationId();
    }

    // Determine span name
    let spanName: string;
    if (typeof options?.spanName === 'function') {
      spanName = options.spanName(message);
    } else if (options?.spanName) {
      spanName = options.spanName;
    } else {
      spanName = `consume ${traceContext.eventType || 'message'}`;
    }

    // Create message handler context
    const handlerContext: MessageHandlerContext = {
      correlationId: traceContext.correlationId,
      traceId: traceContext.traceId,
      eventId: traceContext.eventId,
      eventType: traceContext.eventType,
      userId: traceContext.userId,
    };

    // Run handler within trace context and span
    return runWithTraceContext(traceContext, async () => {
      return withSpan(
        spanName,
        async (span) => {
          // Add span attributes
          const attributes: Record<string, string | number | boolean> = {
            'messaging.system': 'servicebus',
            'messaging.operation': 'receive',
            'messaging.message.id': message.messageId || 'unknown',
          };

          if (message.subject) {
            attributes['messaging.destination'] = message.subject;
          }

          if (traceContext.correlationId) {
            attributes['correlation.id'] = traceContext.correlationId;
          }

          if (traceContext.eventId) {
            attributes['event.id'] = traceContext.eventId;
          }

          if (traceContext.eventType) {
            attributes['event.type'] = traceContext.eventType;
          }

          if (traceContext.userId) {
            attributes['user.id'] = traceContext.userId;
          }

          if (message.enqueuedTimeUtc) {
            attributes['messaging.message.enqueued_time'] = message.enqueuedTimeUtc.toISOString();
          }

          if (message.deliveryCount !== undefined) {
            attributes['messaging.message.delivery_count'] = message.deliveryCount;
          }

          // Add additional custom attributes
          if (options?.additionalAttributes) {
            Object.assign(attributes, options.additionalAttributes(message));
          }

          span.setAttributes(attributes);

          // Execute handler
          return handler(message, handlerContext);
        },
        {
          kind: SpanKind.CONSUMER,
        }
      );
    });
  };
}

/**
 * Wrap Service Bus message producer with distributed tracing
 * 
 * Injects trace context into message properties for distributed tracing.
 * 
 * @param messageProperties - Message application properties (will be mutated)
 * @param spanName - Name for the producer span
 * @returns Updated message properties
 * 
 * @example
 * ```typescript
 * import { withServiceBusProducerTracing } from '@kozy/tracing/service-bus';
 * 
 * const message = {
 *   body: { userId: 123, action: 'created' },
 *   applicationProperties: {
 *     eventType: 'user.created',
 *     eventId: uuidv4(),
 *   }
 * };
 * 
 * withServiceBusProducerTracing(
 *   message.applicationProperties,
 *   'publish user.created'
 * );
 * 
 * await sender.sendMessages(message);
 * ```
 */
export async function withServiceBusProducerTracing(
  messageProperties: Record<string, unknown>,
  spanName: string
): Promise<void> {
  await withSpan(
    spanName,
    async (span) => {
      // Inject trace context into message properties
      injectTraceIntoServiceBusMessage(messageProperties);

      // Add span attributes
      span.setAttributes({
        'messaging.system': 'servicebus',
        'messaging.operation': 'publish',
        'messaging.message.id': (messageProperties.eventId as string) || 'unknown',
        'event.type': (messageProperties.eventType as string) || 'unknown',
      });

      if (messageProperties.correlationId) {
        span.setAttribute('correlation.id', messageProperties.correlationId as string);
      }
    },
    {
      kind: SpanKind.PRODUCER,
    }
  );
}

/**
 * Create a tracing-aware Service Bus error handler
 * 
 * @param onError - Custom error handler function
 * @returns Error handler that records exceptions in traces
 * 
 * @example
 * ```typescript
 * import { createServiceBusErrorHandler } from '@kozy/tracing/service-bus';
 * import { logger } from '@kozy/tracing/logger';
 * 
 * receiver.subscribe({
 *   processMessage: withServiceBusTracing(async (message) => {
 *     // Process message
 *   }),
 *   processError: createServiceBusErrorHandler(async (args) => {
 *     logger.error('Service Bus error', {
 *       error: args.error.message,
 *       entityPath: args.entityPath,
 *     });
 *   })
 * });
 * ```
 */
export function createServiceBusErrorHandler(
  onError?: (args: {
    error: Error;
    errorSource: string;
    entityPath: string;
    fullyQualifiedNamespace: string;
  }) => Promise<void>
): (args: {
  error: Error;
  errorSource: string;
  entityPath: string;
  fullyQualifiedNamespace: string;
}) => Promise<void> {
  return async (args) => {
    // Record exception if there's an active span
    recordException(args.error, {
      'messaging.system': 'servicebus',
      'messaging.error.source': args.errorSource,
      'messaging.destination': args.entityPath,
      'messaging.url': args.fullyQualifiedNamespace,
    });

    setSpanStatus(SpanStatusCode.ERROR, args.error.message);

    // Call custom error handler if provided
    if (onError) {
      await onError(args);
    } else {
      console.error('[Service Bus Error]', {
        error: args.error.message,
        errorSource: args.errorSource,
        entityPath: args.entityPath,
        namespace: args.fullyQualifiedNamespace,
      });
    }
  };
}
