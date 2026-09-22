import 'reflect-metadata';
import { existsSync } from 'fs';
import { DataSource } from 'typeorm';
import { buildConfiguration } from '../config/configuration';
import { validateEnvironment } from '../config/environment.validation';
import { createDataSourceOptions } from './database.options';

// Data source for the TypeORM CLI (migration:* scripts). The NestJS app does not import it.
// Variables already present in the environment take precedence over .env, as in ConfigModule.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const { database } = buildConfiguration(validateEnvironment(process.env));

export default new DataSource(createDataSourceOptions(database));
