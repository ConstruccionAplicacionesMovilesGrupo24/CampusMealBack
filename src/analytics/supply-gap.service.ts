import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MealCategory } from '../restaurants/enums/meal-category.enum';
import { OpeningPeriod } from '../restaurants/opening-period';
import {
  evaluateOpeningStatus,
  OpeningStatus,
} from '../restaurants/opening-hours';
import { invalidDateRange } from './analytics-errors';
import {
  DemandDataset,
  GapStatus,
  SupplyGapQueryDto,
  SupplyGapResponseDto,
  SupplyGapRowDto,
  SupplyZone,
  SUPPLY_ZONES,
} from './dto/supply-gap.dto';

interface DemandRow {
  category: MealCategory | null;
  intents: number;
  searchers: number;
}
interface CatalogRow {
  restaurant_id: string;
  zone: string | null;
  active: boolean;
  opening_hours: OpeningPeriod[];
  meal_id: string | null;
  meal_category: MealCategory | null;
}

const CATEGORIES = Object.values(MealCategory);
const MIN_USERS = 5;
const MIN_SHARE = 0.2;
const MAX_LOW_SUPPLY = 1;

// Complementary suppression: if any observed category is sparse, hide the
// whole zone/window/dataset demand partition, including its denominator.
// This prevents within-response subtraction; it is not differential privacy.
export function calculateSupplyGaps(
  demand: DemandRow[],
  catalog: CatalogRow[],
  zone: SupplyZone,
  asOf: Date,
): Pick<
  SupplyGapResponseDto,
  'rows' | 'categorizedSearchIntents' | 'mappedRestaurants' | 'demandSuppressed'
> {
  const total = demand.find((row) => row.category === null);
  const categories = new Map(
    demand
      .filter((row) => row.category !== null)
      .map((row) => [row.category, row]),
  );
  const demandSuppressed =
    (total?.intents ?? 0) > 0 &&
    ((total?.searchers ?? 0) < MIN_USERS ||
      [...categories.values()].some((row) => row.searchers < MIN_USERS));
  const mappedRestaurants = new Set(
    catalog.filter((row) => row.zone === zone).map((row) => row.restaurant_id),
  ).size;
  const openIds = new Set<string>();
  const checkedIds = new Set<string>();
  for (const row of catalog) {
    if (checkedIds.has(row.restaurant_id)) continue;
    checkedIds.add(row.restaurant_id);
    if (
      row.active &&
      evaluateOpeningStatus(row.opening_hours, asOf) !== OpeningStatus.CLOSED
    ) {
      openIds.add(row.restaurant_id);
    }
  }
  const rows = CATEGORIES.map((category): SupplyGapRowDto => {
    const d = categories.get(category);
    const observed = d !== undefined && d.intents > 0;
    const reveal = observed && !demandSuppressed;
    const share =
      reveal && d && total && total.intents > 0
        ? d.intents / total.intents
        : null;
    const highDemand =
      share === null || !d
        ? null
        : d.searchers >= MIN_USERS && share >= MIN_SHARE;
    const relevant = catalog.filter(
      (row) => openIds.has(row.restaurant_id) && row.meal_id !== null,
    );
    // Unknown mapping or meal category may conceal relevant supply. Do not
    // report an exact zero (or a gap) when the catalog cannot support it.
    const incomplete =
      mappedRestaurants === 0 ||
      relevant.some(
        (row) =>
          (!SUPPLY_ZONES.some((known) => known === row.zone) ||
            row.zone === zone) &&
          (row.meal_category === null || row.meal_category === category) &&
          (row.zone !== zone || row.meal_category === null),
      );
    const availableRestaurants = incomplete
      ? null
      : new Set(
          relevant
            .filter(
              (row) => row.zone === zone && row.meal_category === category,
            )
            .map((row) => row.restaurant_id),
        ).size;
    const lowSupply =
      availableRestaurants === null
        ? null
        : availableRestaurants <= MAX_LOW_SUPPLY;
    const status = demandSuppressed
      ? GapStatus.SUPPRESSED
      : !observed
        ? GapStatus.NO_OBSERVATIONS
        : lowSupply === null
          ? GapStatus.UNKNOWN_SUPPLY
          : highDemand && lowSupply
            ? GapStatus.GAP
            : GapStatus.NO_GAP;
    return {
      category,
      searchIntents: reveal && d ? d.intents : null,
      distinctSearchers: reveal && d ? d.searchers : null,
      demandShare: share,
      highDemand,
      availableRestaurants,
      lowSupply,
      suppressed: demandSuppressed,
      status,
    };
  });
  return {
    rows,
    mappedRestaurants,
    demandSuppressed,
    categorizedSearchIntents:
      demandSuppressed || !total?.intents ? null : total.intents,
  };
}

@Injectable()
export class SupplyGapService {
  constructor(private readonly dataSource: DataSource) {}

  async report(query: SupplyGapQueryDto): Promise<SupplyGapResponseDto> {
    const from = Date.parse(`${query.from}T00:00:00Z`);
    const to = Date.parse(`${query.to}T00:00:00Z`);
    const days = (to - from) / 86400000 + 1;
    if (!Number.isFinite(days) || days < 1 || days > 92)
      throw invalidDateRange();
    const synthetic = query.dataset === DemandDataset.SYNTHETIC;
    const asOf = new Date();
    // Existing usage_events uniqueness (user_id, client_event_id) deduplicates retries.
    // Only explicit, recognized category searches contribute to the denominator.
    const demand = await this.dataSource.query<DemandRow[]>(
      `
      SELECT food_category AS category, count(*)::int AS intents,
             count(DISTINCT user_id)::int AS searchers
      FROM usage_events
      WHERE event_type = 'FEATURE_USED' AND feature = 'RESTAURANT_SEARCH'
        AND zone_id = $1 AND synthetic = $4
        AND food_category = ANY($5::varchar[])
        AND occurred_at >= ($2::date::timestamp AT TIME ZONE 'America/Bogota')
        AND occurred_at < (($3::date + 1)::timestamp AT TIME ZONE 'America/Bogota')
      GROUP BY GROUPING SETS ((food_category), ())
    `,
      [query.zone, query.from, query.to, synthetic, CATEGORIES],
    );
    const catalog = await this.dataSource.query<CatalogRow[]>(`
      SELECT r.id AS restaurant_id, r.analytics_zone AS zone, r.active,
             r.opening_hours, m.id AS meal_id, m.meal_category
      FROM restaurants r
      LEFT JOIN meals m ON m.restaurant_id = r.id AND m.available = true
    `);
    return {
      contractVersion: 1,
      policyVersion: 1,
      generatedAt: new Date().toISOString(),
      asOf: asOf.toISOString(),
      zone: query.zone,
      from: query.from,
      to: query.to,
      synthetic,
      ...calculateSupplyGaps(demand, catalog, query.zone, asOf),
      limitations: [
        'Demand uses recorded categorized search intents, not purchases or all students.',
        'Supply is a current catalog snapshot, not historical availability or live inventory; the catalog is shared by both demand datasets.',
        'Unknown catalog coverage prevents exact supply counts; no observations do not imply no demand.',
        'Complementary suppression protects a single response; overlapping date windows may still permit differencing. Restricted analyst access is not a formal anonymity guarantee.',
      ],
    };
  }
}
