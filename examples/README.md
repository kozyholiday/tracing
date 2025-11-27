# @kozy/tracing Examples

This directory contains example implementations showing how to use the `@kozy/tracing` package in different scenarios.

## Examples

### 1. HTTP API (`http-api.ts`)

Express server with distributed tracing for HTTP requests.

**Features:**
- Express middleware integration
- Automatic correlation ID generation
- Error handling middleware
- Custom span creation for database operations
- Async error handling

**Run:**
```bash
npm install express
tsx examples/http-api.ts

# Test endpoints:
curl http://localhost:3000/api/health
curl http://localhost:3000/api/users/123
curl -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -d '{"name":"John","email":"john@example.com"}'
curl http://localhost:3000/api/error
```

### 2. Service Bus Consumer (`service-bus-consumer.ts`)

Azure Service Bus message consumer with distributed tracing.

**Features:**
- Service Bus message tracing
- Trace context extraction from messages
- Automatic correlation ID handling
- Error handler integration
- Multiple event type handling

**Prerequisites:**
```bash
npm install @azure/service-bus @azure/identity
export SERVICE_BUS_NAMESPACE="your-namespace.servicebus.windows.net"
```

**Run:**
```bash
tsx examples/service-bus-consumer.ts
```

### 3. Cron Job (`cron-job.ts`)

Scheduled background job with tracing.

**Features:**
- Batch job tracing
- Job execution tracking
- Performance monitoring
- Error handling for long-running tasks

**Run:**
```bash
tsx examples/cron-job.ts
```

## Prerequisites

Install dependencies:

```bash
npm install tsx
npm install express @azure/service-bus @azure/identity
```

## Environment Variables

```bash
# OpenTelemetry configuration
export OTEL_SERVICE_NAME="example-service"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export NODE_ENV="development"

# For Service Bus example
export SERVICE_BUS_NAMESPACE="your-namespace.servicebus.windows.net"
```

## Running with Datadog Agent

To see traces in Datadog, ensure you have the Datadog Agent running with OTLP receiver enabled:

### Docker Compose (for local testing)

```yaml
version: '3'
services:
  datadog:
    image: gcr.io/datadoghq/agent:latest
    environment:
      - DD_API_KEY=${DD_API_KEY}
      - DD_SITE=datadoghq.com
      - DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT=0.0.0.0:4318
      - DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_GRPC_ENDPOINT=0.0.0.0:4317
    ports:
      - "4318:4318"  # OTLP HTTP
      - "4317:4317"  # OTLP gRPC
```

Start the agent:
```bash
export DD_API_KEY=your-datadog-api-key
docker-compose up -d
```

## Viewing Traces

1. Run one of the examples
2. Generate some traffic (make requests, send messages, etc.)
3. Open Datadog APM: https://app.datadoghq.com/apm/traces
4. Filter by service name (e.g., `example-api`)
5. Click on a trace to see detailed span information

## Key Concepts Demonstrated

### Correlation IDs
All examples show how correlation IDs flow through the system:
- HTTP: `x-correlation-id` header
- Service Bus: `correlationId` message property
- Logs: Automatically included via mixin

### Trace Context Propagation
- HTTP: W3C `traceparent` header (automatic)
- Service Bus: Manual injection/extraction
- AsyncLocalStorage: Automatic across async operations

### Structured Logging
All logs include:
- `traceId`: OpenTelemetry trace ID
- `spanId`: Current span ID
- `correlationId`: Business correlation ID
- `service`: Service name
- Custom context fields

### Error Handling
- Exceptions recorded on spans
- Span status set to ERROR
- Errors logged with full context
- Automatic retry via Service Bus delivery count

## Next Steps

1. Copy these examples to your service
2. Customize the service name and configuration
3. Add your business logic
4. Deploy to Azure AKS
5. Monitor in Datadog APM

For more information, see the main [README.md](../README.md).
