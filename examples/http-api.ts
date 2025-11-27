import express from 'express';
import { initTracing } from '@kozy/tracing';
import { createTracingMiddleware, createErrorMiddleware, asyncHandler } from '@kozy/tracing/express';
import { createLogger } from '@kozy/tracing/logger';
import { addSpanAttribute, withSpan } from '@kozy/tracing';

// Initialize tracing FIRST, before importing other application code
initTracing({
  serviceName: 'example-api',
  environment: process.env.NODE_ENV || 'development',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  debug: true,
});

// Create logger
export const logger = createLogger({
  service: 'example-api',
  level: 'info',
});

// Create Express app
const app = express();
app.use(express.json());

// Add tracing middleware early in the stack
app.use(createTracingMiddleware({
  extractUserId: (req) => req.headers['x-user-id'] as string,
  additionalAttributes: (req) => ({
    'api.version': 'v1',
  }),
}));

// Example: Simple GET endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Example: GET with database operation (simulated)
app.get('/api/users/:id', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  
  logger.info('Fetching user', { userId });
  
  // Add custom span attribute
  addSpanAttribute('user.id', userId);
  
  // Simulate database query with custom span
  const user = await withSpan(
    'db.query.users',
    async (span) => {
      span.setAttribute('db.operation', 'SELECT');
      span.setAttribute('db.table', 'users');
      
      // Simulate query delay
      await new Promise(resolve => setTimeout(resolve, 50));
      
      return {
        id: userId,
        name: 'John Doe',
        email: 'john@example.com',
      };
    }
  );
  
  logger.info('User fetched successfully', { userId });
  
  res.json(user);
}));

// Example: POST endpoint
app.post('/api/users', asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  
  logger.info('Creating user', { name, email });
  
  // Simulate user creation
  const user = await withSpan(
    'db.insert.users',
    async (span) => {
      span.setAttribute('db.operation', 'INSERT');
      span.setAttribute('db.table', 'users');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        id: Math.random().toString(36).substring(7),
        name,
        email,
      };
    }
  );
  
  logger.info('User created', { userId: user.id });
  
  res.status(201).json(user);
}));

// Example: Endpoint that throws an error
app.get('/api/error', asyncHandler(async (req, res) => {
  logger.warn('About to throw error');
  
  throw new Error('This is a test error');
}));

// Example: Call external API
app.get('/api/external', asyncHandler(async (req, res) => {
  // HTTP calls are automatically traced by OpenTelemetry auto-instrumentation
  const response = await fetch('https://jsonplaceholder.typicode.com/posts/1');
  const data = await response.json();
  
  logger.info('External API called');
  
  res.json(data);
}));

// Add error middleware LAST
app.use(createErrorMiddleware({
  logger,
  includeStack: process.env.NODE_ENV !== 'production',
}));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server started`, { port: PORT });
  console.log(`
🚀 Example API Server Started
   
   URL:     http://localhost:${PORT}
   
   Try these endpoints:
   GET  /api/health
   GET  /api/users/:id
   POST /api/users
   GET  /api/error
   GET  /api/external
   
   View traces in Datadog APM
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});
