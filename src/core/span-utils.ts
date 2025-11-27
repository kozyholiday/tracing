import { trace, Span, SpanStatusCode, SpanKind, Context } from '@opentelemetry/api';

/**
 * Get the current active span
 * 
 * @returns Active span or undefined if no span is active
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Add a single attribute to the current active span
 * 
 * @param key - Attribute key
 * @param value - Attribute value
 * 
 * @example
 * ```typescript
 * addSpanAttribute('user.id', userId);
 * addSpanAttribute('order.total', 99.99);
 * ```
 */
export function addSpanAttribute(
  key: string,
  value: string | number | boolean | string[]
): void {
  const span = getCurrentSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}

/**
 * Add multiple attributes to the current active span
 * 
 * @param attributes - Record of attributes to add
 * 
 * @example
 * ```typescript
 * addSpanAttributes({
 *   'user.id': userId,
 *   'user.email': userEmail,
 *   'order.id': orderId,
 * });
 * ```
 */
export function addSpanAttributes(
  attributes: Record<string, string | number | boolean | string[]>
): void {
  const span = getCurrentSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Add an event to the current active span
 * 
 * Events are timestamped occurrences during a span's lifetime
 * 
 * @param name - Event name
 * @param attributes - Optional event attributes
 * 
 * @example
 * ```typescript
 * addSpanEvent('email.sent', { recipient: 'user@example.com' });
 * addSpanEvent('payment.processed', { amount: 99.99, currency: 'USD' });
 * ```
 */
export function addSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  const span = getCurrentSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Record an exception on the current active span
 * 
 * @param error - Error to record
 * @param attributes - Optional additional attributes
 * 
 * @example
 * ```typescript
 * try {
 *   await processPayment();
 * } catch (error) {
 *   recordException(error, { 'payment.id': paymentId });
 *   throw error;
 * }
 * ```
 */
export function recordException(
  error: Error | unknown,
  attributes?: Record<string, string | number | boolean>
): void {
  const span = getCurrentSpan();
  if (span) {
    span.recordException(error as Error, attributes);
  }
}

/**
 * Set the status of the current active span
 * 
 * @param status - Span status (OK, ERROR, UNSET)
 * @param message - Optional status message
 * 
 * @example
 * ```typescript
 * setSpanStatus(SpanStatusCode.ERROR, 'Payment failed');
 * ```
 */
export function setSpanStatus(status: SpanStatusCode, message?: string): void {
  const span = getCurrentSpan();
  if (span) {
    span.setStatus({
      code: status,
      message,
    });
  }
}

/**
 * Create and run a manual span
 * 
 * This is useful for instrumenting custom operations that aren't automatically traced.
 * The span will automatically end when the function completes.
 * 
 * @param spanName - Name of the span
 * @param fn - Function to run within the span
 * @param options - Optional span configuration
 * @returns Result of the function
 * 
 * @example
 * ```typescript
 * const result = await withSpan(
 *   'process-payment',
 *   async (span) => {
 *     span.setAttribute('payment.amount', 99.99);
 *     span.setAttribute('payment.currency', 'USD');
 *     
 *     const result = await paymentGateway.charge();
 *     
 *     span.addEvent('payment.charged');
 *     return result;
 *   },
 *   {
 *     kind: SpanKind.CLIENT,
 *     attributes: { 'payment.gateway': 'stripe' }
 *   }
 * );
 * ```
 */
export async function withSpan<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  }
): Promise<T> {
  const tracer = trace.getTracer('@kozy/tracing');

  return tracer.startActiveSpan(
    spanName,
    {
      kind: options?.kind,
      attributes: options?.attributes,
    },
    async (span: Span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Create a span without activating it
 * 
 * Useful for creating spans that should not be part of the current context.
 * You must manually end these spans.
 * 
 * @param spanName - Name of the span
 * @param options - Span configuration
 * @returns Created span
 * 
 * @example
 * ```typescript
 * const span = createSpan('background-task', {
 *   kind: SpanKind.INTERNAL,
 *   attributes: { 'task.id': taskId }
 * });
 * 
 * try {
 *   await processTask();
 *   span.setStatus({ code: SpanStatusCode.OK });
 * } catch (error) {
 *   span.recordException(error);
 *   span.setStatus({ code: SpanStatusCode.ERROR });
 * } finally {
 *   span.end();
 * }
 * ```
 */
export function createSpan(
  spanName: string,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
    context?: Context;
  }
): Span {
  const tracer = trace.getTracer('@kozy/tracing');
  
  return tracer.startSpan(
    spanName,
    {
      kind: options?.kind,
      attributes: options?.attributes,
    },
    options?.context
  );
}
