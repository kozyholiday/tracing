# Quick Start Guide

Get up and running with `@kozy/tracing` in 5 minutes.

## 1. Install

```bash
npm install @kozy/tracing
```

## 2. Initialize (in your main entry point)

```typescript
// src/index.ts or src/server.ts
import { initTracing } from '@kozy/tracing';

// Initialize FIRST, before other imports
initTracing({
  serviceName: 'my-service',
  environment: process.env.NODE_ENV || 'development',
});

// THEN import your application
import { app } from './app';
```

## 3. Add to Express App

```typescript
// src/app.ts
import express from 'express';
import { createTracingMiddleware, createErrorMiddleware } from '@kozy/tracing/express';
import { createLogger } from '@kozy/tracing/logger';

const app = express();

// Create logger
export const logger = createLogger({
  service: 'my-service',
  level: 'info',
});

// Add tracing middleware
app.use(createTracingMiddleware());

// Your routes
app.get('/api/users', async (req, res) => {
  logger.info('Fetching users');
  const users = await db.users.findMany();
  res.json(users);
});

// Add error middleware LAST
app.use(createErrorMiddleware({ logger }));

export { app };
```

## 4. Service Bus Consumer

```typescript
import { withServiceBusTracing } from '@kozy/tracing/service-bus';
import { logger } from './app';

receiver.subscribe({
  processMessage: withServiceBusTracing(async (message, context) => {
    logger.info('Processing message', {
      eventType: context.eventType,
      correlationId: context.correlationId,
    });
    
    // Your processing logic
    await handleMessage(message.body);
  }),
  processError: async (args) => {
    logger.error('Error processing message', { error: args.error });
  },
});
```

## 5. Environment Variables

```bash
# Required
export OTEL_SERVICE_NAME="my-service"

# Recommended
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_DEPLOYMENT_ENVIRONMENT="development"

# Optional
export LOG_LEVEL="info"
export LOG_FORMAT="json"  # or "text" for pretty logs
```

## 6. Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-service
spec:
  template:
    spec:
      containers:
      - name: app
        image: my-service:latest
        env:
          # Service info
          - name: OTEL_SERVICE_NAME
            value: "my-service"
          - name: OTEL_DEPLOYMENT_ENVIRONMENT
            value: "production"
          
          # Datadog Agent (via host IP)
          - name: HOST_IP
            valueFrom:
              fieldRef:
                fieldPath: status.hostIP
          - name: OTEL_EXPORTER_OTLP_ENDPOINT
            value: "http://$(HOST_IP):4318"
          
          # Kubernetes metadata
          - name: K8S_NAMESPACE_NAME
            valueFrom:
              fieldRef:
                fieldPath: metadata.namespace
          - name: K8S_POD_NAME
            valueFrom:
              fieldRef:
                fieldPath: metadata.name
```

## 7. View Traces in Datadog

1. Run your service
2. Make some requests
3. Go to Datadog APM: https://app.datadoghq.com/apm/traces
4. Search for your service name
5. Click on a trace to see details

## Common Patterns

### Add Custom Span

```typescript
import { withSpan } from '@kozy/tracing';

const result = await withSpan('send-email', async (span) => {
  span.setAttribute('email.to', email);
  span.setAttribute('email.template', 'welcome');
  
  await sendEmail(email, 'welcome');
  
  span.addEvent('email.sent');
  
  return { sent: true };
});
```

### Get Current Context

```typescript
import { getCurrentTraceContext } from '@kozy/tracing';

const { traceId, correlationId, userId } = getCurrentTraceContext();

logger.info('Current context', { traceId, correlationId, userId });
```

### Add Span Attributes

```typescript
import { addSpanAttribute } from '@kozy/tracing';

// In any function
addSpanAttribute('user.id', userId);
addSpanAttribute('order.id', orderId);
addSpanAttribute('order.total', 99.99);
```

### Record Exception

```typescript
import { recordException } from '@kozy/tracing';

try {
  await riskyOperation();
} catch (error) {
  recordException(error);
  logger.error('Operation failed', { error });
  throw error;
}
```

## Troubleshooting

### Traces not appearing?

1. Check Datadog Agent is running: `kubectl get pods -n monitoring`
2. Check OTLP endpoint is correct: `echo $OTEL_EXPORTER_OTLP_ENDPOINT`
3. Enable debug logs: `initTracing({ debug: true })`

### Logs missing trace IDs?

1. Ensure `initTracing()` is called before creating logger
2. Verify you're using logger from `@kozy/tracing/logger`
3. Check code is running within a traced context

### Import errors?

```bash
# Make sure package is installed
npm install @kozy/tracing

# Check package.json has correct version
cat package.json | grep @kozy/tracing
```

## Next Steps

- Read the full [README.md](./README.md)
- Check out [examples/](./examples/)
- Review [DESIGN.md](./DESIGN.md) for architecture details

## Need Help?

Contact Platform Team on Slack or open an issue in the repository.
