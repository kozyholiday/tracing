import { ServiceBusClient, ServiceBusMessage } from '@azure/service-bus';
import { DefaultAzureCredential } from '@azure/identity';
import { initTracing } from '@kozy/tracing';
import { withServiceBusTracing, createServiceBusErrorHandler } from '@kozy/tracing/service-bus';
import { createLogger } from '@kozy/tracing/logger';
import { addSpanAttribute, withSpan } from '@kozy/tracing';

// Initialize tracing
initTracing({
  serviceName: 'example-consumer',
  environment: process.env.NODE_ENV || 'development',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  debug: true,
});

// Create logger
const logger = createLogger({
  service: 'example-consumer',
  boundedContext: 'notifications',
  level: 'info',
});

// Service Bus configuration
const SERVICE_BUS_NAMESPACE = process.env.SERVICE_BUS_NAMESPACE || 'my-namespace.servicebus.windows.net';
const TOPIC_NAME = 'events';
const SUBSCRIPTION_NAME = 'example-subscription';

// Initialize Service Bus client with Azure AD
const credential = new DefaultAzureCredential();
const serviceBusClient = new ServiceBusClient(SERVICE_BUS_NAMESPACE, credential);

/**
 * Simulate processing a user.created event
 */
async function handleUserCreatedEvent(data: {
  userId: string;
  email: string;
  name: string;
}) {
  logger.info('Processing user.created event', { userId: data.userId });
  
  addSpanAttribute('user.id', data.userId);
  addSpanAttribute('user.email', data.email);
  
  // Simulate sending welcome email
  await withSpan(
    'send-welcome-email',
    async (span) => {
      span.setAttribute('email.type', 'welcome');
      span.setAttribute('email.recipient', data.email);
      
      // Simulate email sending
      await new Promise(resolve => setTimeout(resolve, 200));
      
      span.addEvent('email.sent', {
        'email.recipient': data.email,
        'email.template': 'welcome',
      });
      
      logger.info('Welcome email sent', { userId: data.userId, email: data.email });
    }
  );
  
  // Simulate updating user profile
  await withSpan(
    'update-user-profile',
    async (span) => {
      span.setAttribute('db.operation', 'UPDATE');
      span.setAttribute('user.id', data.userId);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      logger.info('User profile updated', { userId: data.userId });
    }
  );
}

/**
 * Simulate processing a payment.completed event
 */
async function handlePaymentCompletedEvent(data: {
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
}) {
  logger.info('Processing payment.completed event', {
    paymentId: data.paymentId,
    userId: data.userId,
  });
  
  addSpanAttribute('payment.id', data.paymentId);
  addSpanAttribute('payment.amount', data.amount);
  addSpanAttribute('payment.currency', data.currency);
  
  // Simulate sending receipt email
  await withSpan(
    'send-receipt-email',
    async (span) => {
      span.setAttribute('email.type', 'receipt');
      span.setAttribute('payment.amount', data.amount);
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      logger.info('Receipt email sent', {
        paymentId: data.paymentId,
        userId: data.userId,
      });
    }
  );
}

/**
 * Main message processor
 */
async function processMessage(data: {
  eventType: string;
  payload: Record<string, unknown>;
}) {
  switch (data.eventType) {
    case 'user.created':
      await handleUserCreatedEvent(data.payload as Parameters<typeof handleUserCreatedEvent>[0]);
      break;
    
    case 'payment.completed':
      await handlePaymentCompletedEvent(data.payload as Parameters<typeof handlePaymentCompletedEvent>[0]);
      break;
    
    default:
      logger.warn('Unknown event type', { eventType: data.eventType });
  }
}

/**
 * Start consuming messages
 */
async function startConsumer() {
  logger.info('Starting Service Bus consumer', {
    topic: TOPIC_NAME,
    subscription: SUBSCRIPTION_NAME,
  });
  
  const receiver = serviceBusClient.createReceiver(TOPIC_NAME, SUBSCRIPTION_NAME);
  
  // Subscribe with tracing wrapper
  receiver.subscribe({
    processMessage: withServiceBusTracing(async (message, context) => {
      logger.info('Received message', {
        messageId: message.messageId,
        eventType: context.eventType,
        correlationId: context.correlationId,
        deliveryCount: message.deliveryCount,
      });
      
      // Parse message body
      const data = message.body as {
        eventType: string;
        payload: Record<string, unknown>;
      };
      
      // Process message
      await processMessage(data);
      
      logger.info('Message processed successfully', {
        messageId: message.messageId,
        eventType: context.eventType,
      });
    }),
    
    processError: createServiceBusErrorHandler(async (args) => {
      logger.error('Service Bus error', {
        error: args.error.message,
        errorSource: args.errorSource,
        entityPath: args.entityPath,
      });
    }),
  });
  
  logger.info('Service Bus consumer started successfully');
}

// Start consumer
startConsumer().catch((error) => {
  logger.error('Failed to start consumer', { error: error.message });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    await serviceBusClient.close();
    logger.info('Service Bus client closed');
  } catch (error) {
    logger.error('Error closing Service Bus client', { error });
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  try {
    await serviceBusClient.close();
    logger.info('Service Bus client closed');
  } catch (error) {
    logger.error('Error closing Service Bus client', { error });
  }
  
  process.exit(0);
});

console.log(`
🚀 Example Service Bus Consumer Started

   Listening to:
   Topic:        ${TOPIC_NAME}
   Subscription: ${SUBSCRIPTION_NAME}
   
   View traces in Datadog APM
`);
