export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Mirrors the shared "Route provider" enum (architecture doc §9). */
export enum RouteProviderStatus {
  AVAILABLE = 'AVAILABLE',
  PARTIAL = 'PARTIAL',
  UNAVAILABLE = 'UNAVAILABLE',
}

export interface RouteEstimate {
  destination: Coordinates;
  /** Whole minutes, or null when this destination's route could not be calculated. */
  walkingMinutes: number | null;
}

export interface RouteMatrixResult {
  status: RouteProviderStatus;
  estimates: RouteEstimate[];
}

export const ROUTE_PROVIDER_PORT = Symbol('ROUTE_PROVIDER_PORT');

/**
 * Abstraction over an external walking-route service (issue #4). Business
 * services (BQ4, BQ5) depend on this port, never on a specific provider's
 * request/response shapes or credentials — those stay inside
 * `routes/infrastructure`, matching the Adapter pattern required by the issue.
 */
export interface RouteProviderPort {
  getWalkingTimes(
    origin: Coordinates,
    destinations: Coordinates[],
  ): Promise<RouteMatrixResult>;
}
