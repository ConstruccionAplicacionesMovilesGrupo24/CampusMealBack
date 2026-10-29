export enum AnalyticsZone {
  BOGOTA_CENTRO = 'bogota-centro',
  BOGOTA_CHAPINERO = 'bogota-chapinero',
  BOGOTA_TEUSAQUILLO = 'bogota-teusaquillo',
  UNKNOWN = 'unknown',
}

export function zoneFromCampusId(campusId?: string | null): AnalyticsZone {
  switch (campusId) {
    case 'campus-001':
      return AnalyticsZone.BOGOTA_CENTRO;
    case 'campus-002':
      return AnalyticsZone.BOGOTA_CHAPINERO;
    case 'campus-003':
      return AnalyticsZone.BOGOTA_TEUSAQUILLO;
    default:
      return AnalyticsZone.UNKNOWN;
  }
}
