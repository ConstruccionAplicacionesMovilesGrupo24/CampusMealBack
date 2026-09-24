import {
  Coordinates,
  RouteMatrixResult,
  RouteProviderPort,
  RouteProviderStatus,
} from '../domain/route-provider.port';

const EARTH_RADIUS_METERS = 6371000;
// ~4.8 km/h, a typical relaxed walking pace.
const ASSUMED_WALKING_METERS_PER_MINUTE = 80;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function haversineMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Deterministic stand-in for the real route provider: straight-line distance
 * at an assumed walking speed. Same input always produces the same output,
 * and it needs no network access or API key, so `npm run start:dev` works
 * out of the box with ROUTE_PROVIDER_MODE=deterministic (issue #4 acceptance
 * criteria: "the application can start with the deterministic local adapter").
 */
export class DeterministicRouteAdapter implements RouteProviderPort {
  async getWalkingTimes(
    origin: Coordinates,
    destinations: Coordinates[],
  ): Promise<RouteMatrixResult> {
    const estimates = destinations.map((destination) => ({
      destination,
      walkingMinutes: Math.max(
        1,
        Math.round(
          haversineMeters(origin, destination) /
            ASSUMED_WALKING_METERS_PER_MINUTE,
        ),
      ),
    }));

    return Promise.resolve({ status: RouteProviderStatus.AVAILABLE, estimates });
  }
}
