import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { DatabaseConfiguration } from '../config/configuration';

// ts-node (TypeORM CLI) loads .ts sources; the compiled app loads .js from dist.
const extension = __filename.endsWith('.ts') ? 'ts' : 'js';

/**
 * Single source of truth for the TypeORM connection, used by both the NestJS
 * DatabaseModule and the TypeORM CLI data source.
 */
export function createDataSourceOptions(
  database: DatabaseConfiguration,
): DataSourceOptions {
  return {
    type: 'postgres',
    url: database.url,
    ssl: database.ssl,
    // Each feature module keeps its entities, e.g. src/users/entities/user.entity.ts.
    entities: [join(__dirname, '..', '**', `*.entity.${extension}`)],
    migrations: [join(__dirname, 'migrations', `*.${extension}`)],
    migrationsTableName: 'typeorm_migrations',
    // UUID defaults use PostgreSQL's built-in gen_random_uuid() (no uuid-ossp extension).
    uuidExtension: 'pgcrypto',
    // Schema changes happen only through migrations, in every environment.
    synchronize: false,
    migrationsRun: false,
    // Query logging is off so parameters (which may contain personal data) never reach logs.
    logging: false,
    extra: { connectionTimeoutMillis: 5000 },
  };
}
