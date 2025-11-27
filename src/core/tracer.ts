import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter as OTLPHttpTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPTraceExporter as OTLPGrpcTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  CLOUDPROVIDERVALUES_AZURE,
  SEMRESATTRS_CLOUD_PROVIDER,
  SEMRESATTRS_CLOUD_REGION,
} from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;
let isInitialized = false;

/**
 * Configuration options for OpenTelemetry tracing
 */
export interface TracingConfig {
  /**
   * Service name (defaults to OTEL_SERVICE_NAME or SERVICE_NAME env var)
   */
  serviceName?: string;

  /**
   * Service version (defaults to OTEL_SERVICE_VERSION or SERVICE_VERSION env var)
   */
  serviceVersion?: string;

  /**
   * Deployment environment (defaults to OTEL_DEPLOYMENT_ENVIRONMENT, DD_ENV, or NODE_ENV)
   */
  environment?: string;

  /**
   * Service namespace for grouping services (defaults to 'kozy')
   */
  serviceNamespace?: string;

  /**
   * OTLP endpoint for traces (defaults to OTEL_EXPORTER_OTLP_TRACES_ENDPOINT or OTEL_EXPORTER_OTLP_ENDPOINT)
   * For Datadog Agent: http://datadog-agent.monitoring.svc.cluster.local:4318
   * For local development: http://localhost:4318
   */
  otlpEndpoint?: string;

  /**
   * OTLP protocol: 'http' or 'grpc' (defaults to 'http')
   */
  otlpProtocol?: 'http' | 'grpc';

  /**
   * Sampling ratio (0.0 to 1.0, defaults to OTEL_TRACES_SAMPLER_ARG or 1.0)
   * 1.0 = trace everything, 0.1 = trace 10%
   */
  samplingRatio?: number;

  /**
   * Cloud region (defaults to CLOUD_REGION env var)
   */
  cloudRegion?: string;

  /**
   * Additional resource attributes
   */
  resourceAttributes?: Record<string, string>;

  /**
   * Enable debug logging (defaults to OTEL_LOG_LEVEL=debug)
   */
  debug?: boolean;

  /**
   * Disable tracing entirely (defaults to OTEL_SDK_DISABLED)
   */
  disabled?: boolean;

  /**
   * Custom auto-instrumentation options
   */
  instrumentationConfig?: {
    /**
     * Ignore health check endpoints
     */
    ignoreHealthChecks?: boolean;

    /**
     * Additional paths to ignore (e.g., ['/metrics', '/ready'])
     */
    ignoreIncomingPaths?: string[];

    /**
     * Enable file system instrumentation (default: false, usually too noisy)
     */
    enableFsInstrumentation?: boolean;
  };
}

/**
 * Initialize OpenTelemetry tracing with Datadog-compatible configuration
 * 
 * This function sets up distributed tracing for your service using OpenTelemetry.
 * Traces are exported to Datadog Agent via OTLP (OpenTelemetry Protocol).
 * 
 * @example
 * ```typescript
 * import { initTracing } from '@kozy/tracing';
 * 
 * initTracing({
 *   serviceName: 'notifications-api',
 *   environment: 'production',
 *   otlpEndpoint: 'http://datadog-agent.monitoring.svc.cluster.local:4318',
 *   samplingRatio: 1.0,
 * });
 * ```
 * 
 * Environment variables (OpenTelemetry standard):
 * - OTEL_SDK_DISABLED: Disable tracing
 * - OTEL_SERVICE_NAME: Service name
 * - OTEL_SERVICE_VERSION: Service version
 * - OTEL_DEPLOYMENT_ENVIRONMENT: Environment (dev, staging, prod)
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP endpoint base URL
 * - OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: OTLP traces endpoint (overrides OTLP_ENDPOINT)
 * - OTEL_EXPORTER_OTLP_PROTOCOL: Protocol (http/protobuf or grpc)
 * - OTEL_TRACES_SAMPLER: Sampler type (always_on, always_off, traceidratio, parentbased_traceidratio)
 * - OTEL_TRACES_SAMPLER_ARG: Sampler argument (e.g., 0.1 for 10% sampling)
 * - OTEL_RESOURCE_ATTRIBUTES: Additional resource attributes (k=v,k2=v2)
 * - OTEL_LOG_LEVEL: Log level (none, error, warn, info, debug, verbose, all)
 * 
 * Datadog-specific environment variables:
 * - DD_ENV: Environment tag (used if OTEL_DEPLOYMENT_ENVIRONMENT not set)
 * - DD_VERSION: Version tag (used if OTEL_SERVICE_VERSION not set)
 * - DD_SERVICE: Service name (used if OTEL_SERVICE_NAME not set)
 * - DD_AGENT_HOST: Datadog Agent host (used to construct OTLP endpoint if not set)
 * 
 * Kubernetes detection:
 * The package automatically detects Kubernetes environment and adds:
 * - k8s.namespace.name
 * - k8s.pod.name
 * - k8s.node.name
 * - k8s.deployment.name
 * - cloud.provider (azure)
 */
export function initTracing(config: TracingConfig = {}): void {
  // Check if disabled via config or env
  const disabled = config.disabled ?? process.env.OTEL_SDK_DISABLED === 'true';
  if (disabled) {
    console.log('[OpenTelemetry] Tracing disabled via configuration');
    return;
  }

  // Prevent double initialization
  if (isInitialized) {
    console.warn('[OpenTelemetry] Tracing already initialized, skipping');
    return;
  }

  // Enable debug logging if requested
  const debugEnabled =
    config.debug ??
    (process.env.OTEL_LOG_LEVEL === 'debug' ||
     process.env.OTEL_LOG_LEVEL === 'all');
  if (debugEnabled) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  // Resolve configuration from config object and environment variables
  const serviceName =
    config.serviceName ??
    process.env.OTEL_SERVICE_NAME ??
    process.env.DD_SERVICE ??
    process.env.SERVICE_NAME ??
    'unknown-service';

  const serviceVersion =
    config.serviceVersion ??
    process.env.OTEL_SERVICE_VERSION ??
    process.env.DD_VERSION ??
    process.env.SERVICE_VERSION ??
    '1.0.0';

  const environment =
    config.environment ??
    process.env.OTEL_DEPLOYMENT_ENVIRONMENT ??
    process.env.DD_ENV ??
    process.env.NODE_ENV ??
    'development';

  const serviceNamespace = config.serviceNamespace ?? 'kozy';

  const cloudRegion = config.cloudRegion ?? process.env.CLOUD_REGION ?? process.env.AZURE_REGION;

  // Resolve OTLP endpoint
  let otlpEndpoint = config.otlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;

  if (!otlpEndpoint) {
    // Fall back to base OTLP endpoint
    otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  }

  if (!otlpEndpoint && process.env.DD_AGENT_HOST) {
    // Construct from Datadog Agent host
    const ddAgentHost = process.env.DD_AGENT_HOST;
    const protocol = config.otlpProtocol ?? 'http';
    const port = protocol === 'http' ? 4318 : 4317;
    otlpEndpoint = `http://${ddAgentHost}:${port}`;
  }

  if (!otlpEndpoint) {
    // Default for local development
    const protocol = config.otlpProtocol ?? 'http';
    const port = protocol === 'http' ? 4318 : 4317;
    otlpEndpoint = `http://localhost:${port}`;
  }

  const otlpProtocol = config.otlpProtocol ?? (process.env.OTEL_EXPORTER_OTLP_PROTOCOL as 'http' | 'grpc') ?? 'http';

  const samplingRatio =
    config.samplingRatio ?? parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG ?? '1.0');

  console.log(
    `[OpenTelemetry] Initializing tracing - Service: ${serviceName}, Environment: ${environment}, Endpoint: ${otlpEndpoint}, Protocol: ${otlpProtocol}, Sampling: ${samplingRatio}`
  );

  // Create trace exporter based on protocol
  const traceExporter =
    otlpProtocol === 'grpc'
      ? new OTLPGrpcTraceExporter({
          url: otlpEndpoint,
        })
      : new OTLPHttpTraceExporter({
          url: otlpEndpoint.endsWith('/v1/traces') ? otlpEndpoint : `${otlpEndpoint}/v1/traces`,
        });

  // Build resource attributes
  const resourceAttributes: Record<string, string> = {
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    'service.namespace': serviceNamespace,
    [SEMRESATTRS_CLOUD_PROVIDER]: CLOUDPROVIDERVALUES_AZURE,
  };

  // Add cloud region if available
  if (cloudRegion) {
    resourceAttributes[SEMRESATTRS_CLOUD_REGION] = cloudRegion;
  }

  // Kubernetes detection from environment variables
  // These are typically injected via Downward API in Kubernetes
  if (process.env.KUBERNETES_SERVICE_HOST) {
    if (process.env.K8S_NAMESPACE_NAME ?? process.env.NAMESPACE) {
      resourceAttributes['k8s.namespace.name'] = process.env.K8S_NAMESPACE_NAME ?? process.env.NAMESPACE!;
    }
    if (process.env.K8S_POD_NAME ?? process.env.HOSTNAME) {
      resourceAttributes['k8s.pod.name'] = process.env.K8S_POD_NAME ?? process.env.HOSTNAME!;
    }
    if (process.env.K8S_NODE_NAME ?? process.env.NODE_NAME) {
      resourceAttributes['k8s.node.name'] = process.env.K8S_NODE_NAME ?? process.env.NODE_NAME!;
    }
    if (process.env.K8S_DEPLOYMENT_NAME ?? process.env.DEPLOYMENT_NAME) {
      resourceAttributes['k8s.deployment.name'] = process.env.K8S_DEPLOYMENT_NAME ?? process.env.DEPLOYMENT_NAME!;
    }
  }

  // Parse OTEL_RESOURCE_ATTRIBUTES if present
  if (process.env.OTEL_RESOURCE_ATTRIBUTES) {
    const attrs = process.env.OTEL_RESOURCE_ATTRIBUTES.split(',');
    attrs.forEach((attr) => {
      const [key, value] = attr.split('=');
      if (key && value) {
        resourceAttributes[key.trim()] = value.trim();
      }
    });
  }

  // Add custom resource attributes
  if (config.resourceAttributes) {
    Object.assign(resourceAttributes, config.resourceAttributes);
  }

  // Create resource
  const resource = Resource.default().merge(new Resource(resourceAttributes));

  // Configure auto-instrumentation
  const instrumentationConfig = config.instrumentationConfig ?? {};
  const ignoreHealthChecks = instrumentationConfig.ignoreHealthChecks ?? true;
  const ignoreIncomingPaths = instrumentationConfig.ignoreIncomingPaths ?? [];
  const enableFsInstrumentation = instrumentationConfig.enableFsInstrumentation ?? false;

  const instrumentations = getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': {
      enabled: enableFsInstrumentation,
    },
    '@opentelemetry/instrumentation-http': {
      enabled: true,
      ignoreIncomingRequestHook: (request) => {
        const url = request.url || '';

        // Ignore health checks
        if (ignoreHealthChecks) {
          if (url.includes('/health') || url.includes('/ready') || url.includes('/live')) {
            return true;
          }
        }

        // Ignore custom paths
        for (const path of ignoreIncomingPaths) {
          if (url.includes(path)) {
            return true;
          }
        }

        return false;
      },
    },
    '@opentelemetry/instrumentation-express': {
      enabled: true,
    },
    '@opentelemetry/instrumentation-pg': {
      enabled: true,
      enhancedDatabaseReporting: true,
    },
    '@opentelemetry/instrumentation-redis-4': {
      enabled: true,
    },
    '@opentelemetry/instrumentation-dns': {
      enabled: false, // Usually too noisy
    },
    '@opentelemetry/instrumentation-net': {
      enabled: false, // Usually too noisy
    },
  });

  // Initialize SDK
  sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations,
  });

  sdk.start();
  isInitialized = true;

  console.log('[OpenTelemetry] Tracing initialized successfully');

  // Graceful shutdown
  const shutdownHandler = async () => {
    await shutdownTracing();
    process.exit(0);
  };

  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);
}

/**
 * Shutdown OpenTelemetry and flush pending traces
 * 
 * Call this before your application exits to ensure all traces are sent.
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk && isInitialized) {
    console.log('[OpenTelemetry] Shutting down and flushing traces...');
    try {
      await sdk.shutdown();
      isInitialized = false;
      console.log('[OpenTelemetry] Shutdown complete');
    } catch (error) {
      console.error('[OpenTelemetry] Error during shutdown:', error);
      throw error;
    }
  }
}
