import 'reflect-metadata';
import { existsSync } from 'fs';
import { DataSource } from 'typeorm';
import { buildConfiguration } from '../config/configuration';
import { validateEnvironment } from '../config/environment.validation';
import { createDataSourceOptions } from './database.options';

// Data source for the TypeORM CLI (migration:* scripts). The NestJS app does not import it.
// Variables already present in the environment take precedence over .env, as in ConfigModule.
// With NODE_ENV=production (e.g. node --env-file=.env.render) the development .env is skipped,
// so a missing deployment value never falls back to a local database URL or demo password.
if (process.env.NODE_ENV !== 'production' && existsSync('.env')) {
  process.loadEnvFile('.env');
}

const { database } = buildConfiguration(validateEnvironment(process.env));

export default new DataSource(createDataSourceOptions(database));
