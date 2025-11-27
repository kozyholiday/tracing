# @kozy/tracing

Reusable OpenTelemetry tracing package for KozyHoliday microservices with Datadog APM integration. Designed for Node.js/TypeScript services running on Azure AKS.

## Features

- 🔍 **Distributed Tracing** - OpenTelemetry-based tracing with automatic instrumentation
- 🏷️ **Correlation IDs** - Automatic correlation ID propagation across services
- 📊 **Datadog Integration** - Optimized for Datadog APM on Azure AKS
- 🪵 **Structured Logging** - Pino logger with automatic trace context injection
- 🚀 **Express Middleware** - Ready-to-use HTTP tracing middleware
- 📨 **Service Bus Support** - Azure Service Bus message tracing
- ☁️ **Kubernetes Native** - Automatic K8s resource detection
- 🎯 **Type-Safe** - Full TypeScript support

## Installation

```bash
npm install @kozy/tracing
```

### Peer Dependencies

```bash
# For HTTP/Express middleware
npm install express

# For Azure Service Bus integration
npm install @azure/service-bus
```

## Quick Start

### 1. Initialize Tracing

Initialize tracing at your application entry point (before importing other modules):

```typescript
import { initTracing } from '@kozy/tracing';

// Initialize with config
initTracing({
  serviceName: 'notifications-api',
  environment: 'production',
  otlpEndpoint: 'http://datadog-agent.monitoring.svc.cluster.local:4318',
  samplingRatio: 1.0,
});

// Or use environment variables (see Configuration section)
initTracing();

// Now import your app
import { app } from './app';
```

### 2. Add Express Middleware

```typescript
import express from 'express';
import { createTracingMiddleware, createErrorMiddleware } from '@kozy/tracing/express';
import { logger } from '@kozy/tracing/logger';

const app = express();

// Add tracing middleware early in the stack
app.use(createTracingMiddleware({
  extractUserId: (req) => req.user?.id,
}));

// Your routes
app.get('/api/users/:id', async (req, res) => {
  const user = await userService.findById(req.params.id);
  res.json(user);
});

// Add error middleware last
app.use(createErrorMiddleware({ logger }));
```

### 3. Use Logger

```typescript
import { createLogger } from '@kozy/tracing/logger';

export const logger = createLogger({
  service: 'notifications-api',
  level: 'info',
});

// All logs automatically include traceId, spanId, correlationId
logger.info('Processing user request', { userId: '123' });
logger.error('Database error', { error: err.message });
```

### 4. Service Bus Integration

```typescript
import { ServiceBusClient } from '@azure/service-bus';
import { withServiceBusTracing } from '@kozy/tracing/service-bus';
import { logger } from '@kozy/tracing/logger';

const receiver = serviceBusClient.createReceiver('notifications', 'my-subscription');

receiver.subscribe({
  processMessage: withServiceBusTracing(async (message, context) => {
    logger.info('Processing message', {
      eventType: context.eventType,
      correlationId: context.correlationId,
    });
    
    // Your message processing logic
    await handleNotification(message.body);
  }),
  processError: async (args) => {
    logger.error('Service Bus error', { error: args.error });
  },
});
```

## Configuration

### Option 1: Config Object

```typescript
import { initTracing } from '@kozy/tracing';

initTracing({
  serviceName: 'notifications-api',
  serviceVersion: '1.2.3',
  environment: 'production',
  serviceNamespace: 'kozy',
  otlpEndpoint: 'http://datadog-agent.monitoring.svc.cluster.local:4318',
  otlpProtocol: 'http', // or 'grpc'
  samplingRatio: 1.0, // 1.0 = trace everything
  cloudRegion: 'westeurope',
  debug: false,
  resourceAttributes: {
    'team': 'platform',
  },
  instrumentationConfig: {
    ignoreHealthChecks: true,
    ignoreIncomingPaths: ['/metrics'],
  },
});
```

### Option 2: Environment Variables

The package follows [OpenTelemetry environment variable conventions](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/):

#### Core Configuration

```bash
# Disable tracing
OTEL_SDK_DISABLED=false

# Service identification
OTEL_SERVICE_NAME=notifications-api
OTEL_SERVICE_VERSION=1.2.3
OTEL_DEPLOYMENT_ENVIRONMENT=production

# OTLP exporter
OTEL_EXPORTER_OTLP_ENDPOINT=http://datadog-agent.monitoring.svc.cluster.local:4318
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://datadog-agent.monitoring.svc.cluster.local:4318/v1/traces
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf  # or grpc

# Sampling
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=1.0

# Resource attributes
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production,service.namespace=kozy

# Debug logging
OTEL_LOG_LEVEL=info  # or debug, error, warn
```

#### Datadog-Specific (fallback if OTEL_* not set)

```bash
DD_SERVICE=notifications-api
DD_VERSION=1.2.3
DD_ENV=production
DD_AGENT_HOST=datadog-agent.monitoring.svc.cluster.local
```

#### Kubernetes (auto-detected via Downward API)

```bash
K8S_NAMESPACE_NAME=notifications
K8S_POD_NAME=notifications-api-5d7f8b-xyz
K8S_NODE_NAME=aks-nodepool1-12345
K8S_DEPLOYMENT_NAME=notifications-api

# Alternative naming
NAMESPACE=notifications
HOSTNAME=notifications-api-5d7f8b-xyz
NODE_NAME=aks-nodepool1-12345
DEPLOYMENT_NAME=notifications-api
```

#### Logging

```bash
LOG_LEVEL=info          # trace, debug, info, warn, error, fatal
LOG_FORMAT=json         # json or text (text uses pino-pretty)
NODE_ENV=production     # affects default log format
```

## Azure AKS Setup

### Kubernetes Deployment Configuration

#### 1. Inject Kubernetes Metadata (Downward API)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notifications-api
spec:
  template:
    spec:
      containers:
      - name: app
        image: kozy/notifications-api:latest
        env:
          # Service identification
          - name: OTEL_SERVICE_NAME
            value: "notifications-api"
          - name: OTEL_SERVICE_VERSION
            value: "1.2.3"
          - name: OTEL_DEPLOYMENT_ENVIRONMENT
            value: "production"
          
          # Datadog Agent endpoint (DaemonSet on same node)
          - name: OTEL_EXPORTER_OTLP_ENDPOINT
            value: "http://$(HOST_IP):4318"
          
          # Kubernetes metadata (Downward API)
          - name: K8S_NAMESPACE_NAME
            valueFrom:
              fieldRef:
                fieldPath: metadata.namespace
          - name: K8S_POD_NAME
            valueFrom:
              fieldRef:
                fieldPath: metadata.name
          - name: K8S_NODE_NAME
            valueFrom:
              fieldRef:
                fieldPath: spec.nodeName
          - name: HOST_IP
            valueFrom:
              fieldRef:
                fieldPath: status.hostIP
          
          # Cloud metadata
          - name: CLOUD_REGION
            value: "westeurope"
```

#### 2. Datadog Agent DaemonSet (OTLP Receiver)

Ensure your Datadog Agent is configured to accept OTLP traces:

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: datadog-agent
  namespace: monitoring
spec:
  template:
    spec:
      containers:
      - name: agent
        image: gcr.io/datadoghq/agent:latest
        env:
          - name: DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT
            value: "0.0.0.0:4318"
          - name: DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_GRPC_ENDPOINT
            value: "0.0.0.0:4317"
        ports:
          - containerPort: 4318  # OTLP HTTP
            name: otlp-http
          - containerPort: 4317  # OTLP gRPC
            name: otlp-grpc
```

## API Reference

### Core Tracing

#### `initTracing(config?: TracingConfig)`

Initialize OpenTelemetry with Datadog integration.

```typescript
initTracing({
  serviceName: 'my-service',
  environment: 'production',
  otlpEndpoint: 'http://localhost:4318',
});
```

#### `shutdownTracing()`

Gracefully shutdown tracing and flush pending spans.

```typescript
await shutdownTracing();
```

### Trace Context

#### `getCurrentTraceContext()`

Get current trace context (traceId, spanId, correlationId, etc.).

```typescript
const { traceId, correlationId } = getCurrentTraceContext();
```

#### `setTraceContext(context)`

Set trace context for current async execution.

```typescript
setTraceContext({
  correlationId: 'abc-123',
  userId: 'user-456',
});
```

#### `runWithTraceContext(context, fn)`

Run function with specific trace context.

```typescript
await runWithTraceContext(
  { correlationId: 'abc-123' },
  async () => {
    // All code here has access to this context
  }
);
```

### Manual Spans

#### `withSpan(spanName, fn, options)`

Create a manual span for custom operations.

```typescript
const result = await withSpan(
  'process-payment',
  async (span) => {
    span.setAttribute('payment.amount', 99.99);
    span.addEvent('payment.processing');
    
    const result = await paymentGateway.charge();
    
    return result;
  },
  {
    kind: SpanKind.CLIENT,
    attributes: { 'payment.gateway': 'stripe' },
  }
);
```

#### `addSpanAttribute(key, value)`

Add attribute to current active span.

```typescript
addSpanAttribute('user.id', userId);
```

#### `recordException(error)`

Record exception on current span.

```typescript
try {
  await riskyOperation();
} catch (error) {
  recordException(error);
  throw error;
}
```

### Express Middleware

#### `createTracingMiddleware(options)`

Create middleware for Express HTTP tracing.

```typescript
app.use(createTracingMiddleware({
  correlationIdHeader: 'x-correlation-id',
  generateCorrelationId: true,
  extractUserId: (req) => req.user?.id,
  additionalAttributes: (req) => ({
    'tenant.id': req.tenant?.id,
  }),
}));
```

#### `createErrorMiddleware(options)`

Create error handling middleware.

```typescript
app.use(createErrorMiddleware({
  logger,
  includeStack: process.env.NODE_ENV !== 'production',
}));
```

#### `asyncHandler(fn)`

Wrap async route handlers to catch errors.

```typescript
app.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await userService.findById(req.params.id);
  res.json(user);
}));
```

### Service Bus Integration

#### `withServiceBusTracing(handler, options)`

Wrap Service Bus message handler with tracing.

```typescript
receiver.subscribe({
  processMessage: withServiceBusTracing(async (message, context) => {
    logger.info('Processing', { correlationId: context.correlationId });
    await handleMessage(message.body);
  }),
});
```

#### `withServiceBusProducerTracing(properties, spanName)`

Trace Service Bus message publishing.

```typescript
const message = {
  body: { userId: 123 },
  applicationProperties: {
    eventType: 'user.created',
    eventId: randomUUID(),
  }
};

await withServiceBusProducerTracing(
  message.applicationProperties,
  'publish user.created'
);

await sender.sendMessages(message);
```

### Logger

#### `createLogger(options)`

Create a Pino logger with trace context injection.

```typescript
export const logger = createLogger({
  service: 'notifications-api',
  boundedContext: 'notifications',
  level: 'info',
  environment: 'production',
});

logger.info('User created', { userId: '123' });
// Output: {"level":"info","service":"notifications-api","traceId":"...","correlationId":"...","userId":"123","msg":"User created"}
```

## Migration from Existing Notifications Service

If you're migrating from the existing notifications service, here's what changes:

### Before

```typescript
// Old approach - scattered across multiple files
import { createLogger } from '@kozy/utils';
import { withConsumeSpan } from '@kozy/utils/tracing';
import { runWithTraceContext } from '@kozy/utils';

const logger = createLogger({ service: 'notifications' });
```

### After

```typescript
// New approach - unified package
import { initTracing } from '@kozy/tracing';
import { createLogger } from '@kozy/tracing/logger';
import { withServiceBusTracing } from '@kozy/tracing/service-bus';
import { runWithTraceContext } from '@kozy/tracing';

// Initialize once at startup
initTracing({
  serviceName: 'notifications-api',
  environment: process.env.NODE_ENV,
});

export const logger = createLogger({ service: 'notifications-api' });
```

### Key Differences

1. **Initialization**: Use `initTracing()` instead of auto-initialization
2. **Imports**: All tracing functionality from `@kozy/tracing` instead of `@kozy/utils`
3. **Service Bus**: Use `withServiceBusTracing()` instead of `withConsumeSpan()`
4. **Standardization**: Consistent API across all services

## Datadog Integration

### Trace Visualization

Once configured, your traces will appear in Datadog APM:

1. **Service Map**: Visualize service dependencies
2. **Trace Explorer**: Search and analyze traces
3. **Service Performance**: Monitor latency, throughput, errors
4. **Log Correlation**: Click from traces to related logs

### Key Datadog Features

- **Automatic Service Discovery**: Services auto-register based on `service.name`
- **Resource Detection**: Kubernetes pods, nodes, deployments tagged automatically
- **Log-Trace Correlation**: Logs linked to traces via `traceId`
- **Error Tracking**: Exceptions recorded as span errors
- **Custom Tags**: Add business context via span attributes

### Datadog Query Examples

```
# Find traces for specific user
@correlationId:<correlation-id>

# Find errors in service
service:notifications-api status:error

# Find slow requests
service:notifications-api @duration:>1s

# Find specific event type
@event.type:user.created
```

## Best Practices

### 1. Initialize Early

```typescript
// index.ts or server.ts
import { initTracing } from '@kozy/tracing';

// FIRST: Initialize tracing
initTracing();

// THEN: Import application code
import { app } from './app';
import { startConsumer } from './consumer';
```

### 2. Use Correlation IDs

```typescript
// API Gateway generates correlation ID
const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();

// Pass to downstream services
await httpClient.post('/api/users', data, {
  headers: { 'x-correlation-id': correlationId }
});

// Service Bus messages
message.applicationProperties.correlationId = correlationId;
```

### 3. Add Business Context

```typescript
// Add meaningful span attributes
addSpanAttributes({
  'user.id': userId,
  'order.id': orderId,
  'order.total': orderTotal,
  'payment.method': 'credit_card',
});

// Log with context
logger.info('Order placed', {
  userId,
  orderId,
  total: orderTotal,
});
```

### 4. Handle Errors Properly

```typescript
try {
  await processPayment(paymentId);
} catch (error) {
  // Record on span
  recordException(error);
  
  // Log with context
  logger.error('Payment failed', {
    error: error.message,
    paymentId,
  });
  
  // Re-throw or handle
  throw error;
}
```

### 5. Use Child Loggers

```typescript
function processUser(userId: string) {
  // Create child logger with userId bound
  const userLogger = logger.child({ userId });
  
  userLogger.info('Processing user');
  // All logs include userId automatically
}
```

## Troubleshooting

### Traces Not Appearing in Datadog

1. **Check OTLP endpoint is reachable**:
   ```bash
   kubectl exec -it <pod> -- curl http://datadog-agent.monitoring.svc.cluster.local:4318/v1/traces
   ```

2. **Verify Datadog Agent logs**:
   ```bash
   kubectl logs -n monitoring daemonset/datadog-agent | grep otlp
   ```

3. **Enable debug logging**:
   ```typescript
   initTracing({ debug: true });
   ```

4. **Check environment variables**:
   ```bash
   kubectl exec -it <pod> -- env | grep OTEL
   ```

### Logs Missing Trace IDs

1. Ensure you're using the logger from `@kozy/tracing/logger`
2. Verify tracing is initialized before logger is created
3. Check that code is running within an active span or trace context

### High Cardinality Issues

If you see "high cardinality" warnings in Datadog:

1. Avoid putting IDs directly in span names:
   ```typescript
   // Bad
   withSpan(`process-user-${userId}`, ...)
   
   // Good
   withSpan('process-user', ..., {
     attributes: { 'user.id': userId }
   })
   ```

2. Use attributes for variable data, span names for operation types

## Performance Considerations

### Sampling

For high-throughput services, use sampling:

```typescript
initTracing({
  samplingRatio: 0.1, // Trace 10% of requests
});
```

### Span Attributes

- Keep attribute counts reasonable (<50 per span)
- Use string values for high-cardinality data
- Avoid large arrays or objects as attributes

### Auto-Instrumentation

Auto-instrumentation adds minimal overhead (~1-2% CPU):

```typescript
// Disable noisy instrumentation
initTracing({
  instrumentationConfig: {
    enableFsInstrumentation: false, // Usually too noisy
    ignoreHealthChecks: true,
    ignoreIncomingPaths: ['/metrics', '/ready'],
  },
});
```

## Examples

See the `examples/` directory for complete working examples:

- **HTTP API**: Express server with tracing
- **Service Bus Consumer**: Event-driven worker with tracing
- **Cron Job**: Scheduled task with tracing

## Architecture Decisions

### Why OpenTelemetry?

- **Vendor-neutral**: Switch APM backends without code changes
- **Industry standard**: CNCF graduated project
- **Auto-instrumentation**: Traces HTTP, PostgreSQL, Redis automatically
- **Future-proof**: Growing ecosystem and adoption

### Why Pino for Logging?

- **Performance**: Fastest JSON logger for Node.js
- **Structured**: Native JSON output for Datadog
- **Low overhead**: Minimal impact on application performance
- **Ecosystem**: Wide adoption and plugin support

### Why AsyncLocalStorage?

- **Automatic propagation**: Context flows through async operations
- **No manual passing**: No need to pass context through function calls
- **Framework agnostic**: Works with any async pattern

## Related Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Datadog OTLP Integration](https://docs.datadoghq.com/tracing/trace_collection/open_standards/otlp_ingest_in_the_agent/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [Pino Documentation](https://github.com/pinojs/pino)

## License

UNLICENSED - Private package for KozyHoliday internal use.

## Support

For issues or questions, contact the Platform Team.
