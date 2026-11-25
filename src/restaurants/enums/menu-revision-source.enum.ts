/** Who produced a menu revision. Only these two writers exist; there is no HTTP mutation. */
export enum MenuRevisionSource {
  /** `npm run menu:edit`, run by the team on behalf of a restaurant. */
  MAINTENANCE_SCRIPT = 'MAINTENANCE_SCRIPT',
  /** `npm run seed:bq13` deterministic demo data. */
  SYNTHETIC_SEED = 'SYNTHETIC_SEED',
}
