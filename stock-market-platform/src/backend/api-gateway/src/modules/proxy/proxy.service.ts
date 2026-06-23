import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  private readonly breakers: Map<string, CircuitBreakerState> = new Map();

  private readonly FAILURE_THRESHOLD = 5;
  private readonly RECOVERY_TIMEOUT_MS = 30000;

  constructor(private readonly configService: ConfigService) {}

  async forward(service: string, path: string, options: {
    method: string;
    body?: any;
    headers?: Record<string, string>;
    timeout?: number;
  }): Promise<any> {
    const serviceUrl = this.getServiceUrl(service);
    if (!serviceUrl) {
      throw new ServiceUnavailableException(`Unknown service: ${service}`);
    }

    // Check circuit breaker
    if (this.isCircuitOpen(service)) {
      throw new ServiceUnavailableException(`Service ${service} is temporarily unavailable`);
    }

    const url = `${serviceUrl}${path}`;
    const timeout = options.timeout ?? 5000;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.warn(`Service ${service} returned ${response.status}: ${errorBody}`);

        if (response.status >= 500) {
          this.recordFailure(service);
        }

        return {
          statusCode: response.status,
          body: this.tryParseJson(errorBody),
        };
      }

      this.recordSuccess(service);
      const body = await response.json();
      return { statusCode: response.status, body };

    } catch (error: any) {
      this.recordFailure(service);
      this.logger.error(`Failed to reach ${service}: ${error.message}`);
      throw new ServiceUnavailableException(`Service ${service} is unavailable`);
    }
  }

  private getServiceUrl(service: string): string | undefined {
    const services = this.configService.get<Record<string, string>>('services');
    return services?.[service];
  }

  private isCircuitOpen(service: string): boolean {
    const breaker = this.breakers.get(service);
    if (!breaker || breaker.state === 'closed') return false;

    if (breaker.state === 'open') {
      const elapsed = Date.now() - breaker.lastFailure;
      if (elapsed > this.RECOVERY_TIMEOUT_MS) {
        breaker.state = 'half-open';
        return false;
      }
      return true;
    }

    return false;
  }

  private recordFailure(service: string): void {
    const breaker = this.breakers.get(service) ?? {
      failures: 0,
      lastFailure: 0,
      state: 'closed' as const,
    };

    breaker.failures++;
    breaker.lastFailure = Date.now();

    if (breaker.failures >= this.FAILURE_THRESHOLD) {
      breaker.state = 'open';
      this.logger.warn(`Circuit OPEN for service: ${service}`);
    }

    this.breakers.set(service, breaker);
  }

  private recordSuccess(service: string): void {
    const breaker = this.breakers.get(service);
    if (breaker) {
      breaker.failures = 0;
      breaker.state = 'closed';
    }
  }

  private tryParseJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }
}
