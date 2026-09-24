import { Logger } from '@nestjs/common';
import {
  Coordinates,
  RouteMatrixResult,
  RouteProviderPort,
  RouteProviderStatus,
} from '../domain/route-provider.port';

export interface ExternalRouteProviderConfig {
  url: string;
  apiKey: string | null;
  timeoutMs: number;
}

// The provider's own wire format. Kept private to this file so business
// services never see it — only RouteMatrixResult crosses the port boundary.
interface ProviderMatrixResponse {
  destinations: Array<{ durationSeconds: number | null }>;
}

/**
 * Calls an external walking-route/matrix service (issue #4). A provider
 * failure — timeout, non-2xx, malformed body — becomes UNAVAILABLE rather
 * than a thrown error, so it can never crash the restaurant endpoint. Exact
 * user coordinates and the API key are never logged (architecture doc §18).
 */
export class ExternalRouteAdapter implements RouteProviderPort {
  private readonly logger = new Logger(ExternalRouteAdapter.name);

  constructor(private readonly config: ExternalRouteProviderConfig) {}

  async getWalkingTimes(
    origin: Coordinates,
    destinations: Coordinates[],
  ): Promise<RouteMatrixResult> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs,
    );

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({ origin, destinations, mode: 'walking' }),
      });

      if (!response.ok) {
        this.logger.warn(`Route provider responded with HTTP ${response.status}`);
        return unavailable(destinations);
      }

      const body = (await response.json()) as ProviderMatrixResponse;
      return mapResponse(destinations, body);
    } catch (error) {
      this.logger.warn(
        `Route provider request failed: ${(error as Error).name}`,
      );
      return unavailable(destinations);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function unavailable(destinations: Coordinates[]): RouteMatrixResult {
  return {
    status: RouteProviderStatus.UNAVAILABLE,
    estimates: destinations.map((destination) => ({
      destination,
      walkingMinutes: null,
    })),
  };
}

function mapResponse(
  destinations: Coordinates[],
  body: ProviderMatrixResponse,
): RouteMatrixResult {
  const estimates = destinations.map((destination, index) => {
    const seconds = body.destinations?.[index]?.durationSeconds;
    return {
      destination,
      walkingMinutes:
        typeof seconds === 'number' ? Math.max(1, Math.round(seconds / 60)) : null,
    };
  });

  const resolvedCount = estimates.filter((e) => e.walkingMinutes !== null).length;
  const status =
    resolvedCount === estimates.length
      ? RouteProviderStatus.AVAILABLE
      : resolvedCount === 0
        ? RouteProviderStatus.UNAVAILABLE
        : RouteProviderStatus.PARTIAL;

  return { status, estimates };
}
