import { initTracing } from '@kozy/tracing';
import { createLogger } from '@kozy/tracing/logger';
import { withSpan, addSpanAttribute } from '@kozy/tracing';

// Initialize tracing
initTracing({
  serviceName: 'example-cron-job',
  environment: process.env.NODE_ENV || 'development',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  debug: true,
});

// Create logger
const logger = createLogger({
  service: 'example-cron-job',
  level: 'info',
});

/**
 * Simulate processing stale notifications
 */
async function processStaleNotifications(): Promise<void> {
  logger.info('Starting stale notifications cleanup');
  
  await withSpan('cleanup-stale-notifications', async (span) => {
    // Simulate fetching stale notifications from database
    const staleNotifications = await withSpan(
      'db.query.stale-notifications',
      async (innerSpan) => {
        innerSpan.setAttribute('db.operation', 'SELECT');
        innerSpan.setAttribute('db.table', 'notifications');
        
        // Simulate query
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Simulate result
        return [
          { id: '1', userId: 'user-1', createdAt: new Date() },
          { id: '2', userId: 'user-2', createdAt: new Date() },
          { id: '3', userId: 'user-3', createdAt: new Date() },
        ];
      }
    );
    
    span.setAttribute('notifications.count', staleNotifications.length);
    logger.info('Found stale notifications', { count: staleNotifications.length });
    
    // Process each notification
    for (const notification of staleNotifications) {
      await withSpan(
        'process-notification',
        async (innerSpan) => {
          innerSpan.setAttribute('notification.id', notification.id);
          innerSpan.setAttribute('user.id', notification.userId);
          
          logger.info('Processing notification', {
            notificationId: notification.id,
            userId: notification.userId,
          });
          
          // Simulate processing
          await new Promise(resolve => setTimeout(resolve, 100));
          
          innerSpan.addEvent('notification.processed');
        }
      );
    }
    
    logger.info('Stale notifications cleanup completed', {
      processedCount: staleNotifications.length,
    });
    
    span.addEvent('cleanup.completed', {
      'notifications.processed': staleNotifications.length,
    });
  });
}

/**
 * Simulate generating daily reports
 */
async function generateDailyReports(): Promise<void> {
  logger.info('Starting daily report generation');
  
  await withSpan('generate-daily-reports', async (span) => {
    const reportDate = new Date().toISOString().split('T')[0];
    span.setAttribute('report.date', reportDate);
    
    // Generate user activity report
    await withSpan('generate-user-activity-report', async (innerSpan) => {
      innerSpan.setAttribute('report.type', 'user-activity');
      
      logger.info('Generating user activity report', { date: reportDate });
      
      // Simulate report generation
      await new Promise(resolve => setTimeout(resolve, 300));
      
      innerSpan.addEvent('report.generated', {
        'report.type': 'user-activity',
        'report.size': 1024,
      });
      
      logger.info('User activity report generated', { date: reportDate });
    });
    
    // Generate revenue report
    await withSpan('generate-revenue-report', async (innerSpan) => {
      innerSpan.setAttribute('report.type', 'revenue');
      
      logger.info('Generating revenue report', { date: reportDate });
      
      // Simulate report generation
      await new Promise(resolve => setTimeout(resolve, 250));
      
      innerSpan.addEvent('report.generated', {
        'report.type': 'revenue',
        'report.size': 2048,
      });
      
      logger.info('Revenue report generated', { date: reportDate });
    });
    
    logger.info('Daily reports generation completed');
  });
}

/**
 * Main job execution
 */
async function runJob(jobName: string, jobFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  
  logger.info('Job started', { jobName });
  
  await withSpan(`cron.job.${jobName}`, async (span) => {
    span.setAttribute('job.name', jobName);
    span.setAttribute('job.start_time', new Date().toISOString());
    
    try {
      await jobFn();
      
      const duration = Date.now() - startTime;
      span.setAttribute('job.status', 'success');
      span.setAttribute('job.duration_ms', duration);
      
      logger.info('Job completed successfully', {
        jobName,
        durationMs: duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      span.setAttribute('job.status', 'failed');
      span.setAttribute('job.duration_ms', duration);
      
      logger.error('Job failed', {
        jobName,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: duration,
      });
      
      throw error;
    }
  });
}

/**
 * Schedule jobs (simplified example - use node-cron or similar in production)
 */
async function scheduleJobs(): Promise<void> {
  logger.info('Starting cron job scheduler');
  
  // Run jobs immediately for demo
  try {
    await runJob('cleanup-stale-notifications', processStaleNotifications);
    await runJob('generate-daily-reports', generateDailyReports);
  } catch (error) {
    logger.error('Job execution failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
  
  // In production, you would use node-cron or similar:
  // cron.schedule('0 0 * * *', () => runJob('cleanup-stale-notifications', processStaleNotifications));
  // cron.schedule('0 1 * * *', () => runJob('generate-daily-reports', generateDailyReports));
  
  logger.info('All jobs completed, exiting');
  process.exit(0);
}

// Start scheduler
scheduleJobs().catch((error) => {
  logger.error('Scheduler failed', {
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  process.exit(1);
});

console.log(`
🚀 Example Cron Job Started
   
   Jobs:
   - Cleanup stale notifications
   - Generate daily reports
   
   View traces in Datadog APM
`);
