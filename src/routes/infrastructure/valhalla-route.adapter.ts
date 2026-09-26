import { Logger } from '@nestjs/common';
import {
  Coordinates,
  RouteMatrixResult,
  RouteProviderPort,
  RouteProviderStatus,
} from '../domain/route-provider.port';

export const DEFAULT_VALHALLA_MATRIX_URL =
  'https://valhalla1.openstreetmap.de/sources_to_targets';

export interface ValhallaRouteProviderConfig {
  url: string;
  timeoutMs: number;
}

// Valhalla's wire format (`/sources_to_targets`), private to this file.
interface ValhallaMatrixResponse {
  sources_to_targets?: Array<
    Array<{ to_index?: number; time?: number | null } | null>
  >;
}

/**
 * Real walking-time provider: Valhalla's pedestrian matrix. One request covers
 * every destination. The public FOSSGIS instance needs no API key but has a
 * fair-use policy and no SLA, so it suits the prototype, not production.
 *
 * Timeout, non-2xx or malformed body -> UNAVAILABLE; destinations without a
 * route -> null (PARTIAL). Never throws, never logs coordinates.
 */
export class ValhallaRouteAdapter implements RouteProviderPort {
  private readonly logger = new Logger(ValhallaRouteAdapter.name);

  constructor(private readonly config: ValhallaRouteProviderConfig) {}

  async getWalkingTimes(
    origin: Coordinates,
    destinations: Coordinates[],
  ): Promise<RouteMatrixResult> {
    if (destinations.length === 0) {
      return { status: RouteProviderStatus.AVAILABLE, estimates: [] };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: [toValhalla(origin)],
          targets: destinations.map(toValhalla),
          costing: 'pedestrian',
        }),
      });

      if (!response.ok) {
        this.logger.warn(`Valhalla responded with HTTP ${response.status}`);
        return unavailable(destinations);
      }

      const body = (await response.json()) as ValhallaMatrixResponse;
      return mapResponse(destinations, body);
    } catch (error) {
      this.logger.warn(`Valhalla request failed: ${(error as Error).name}`);
      return unavailable(destinations);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toValhalla({ latitude, longitude }: Coordinates) {
  return { lat: latitude, lon: longitude };
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
  body: ValhallaMatrixResponse,
): RouteMatrixResult {
  const row = body.sources_to_targets?.[0];
  if (!Array.isArray(row)) {
    return unavailable(destinations);
  }

  const secondsByTarget = new Map<number, number>();
  row.forEach((cell, index) => {
    if (cell && typeof cell.time === 'number' && Number.isFinite(cell.time)) {
      secondsByTarget.set(cell.to_index ?? index, cell.time);
    }
  });

  const estimates = destinations.map((destination, index) => {
    const seconds = secondsByTarget.get(index);
    return {
      destination,
      walkingMinutes:
        seconds === undefined ? null : Math.max(1, Math.round(seconds / 60)),
    };
  });

  const resolved = estimates.filter((e) => e.walkingMinutes !== null).length;
  const status =
    resolved === estimates.length
      ? RouteProviderStatus.AVAILABLE
      : resolved === 0
        ? RouteProviderStatus.UNAVAILABLE
        : RouteProviderStatus.PARTIAL;

  return { status, estimates };
}
