import {
  EnvironmentVariables,
  NodeEnvironment,
  validateEnvironment,
} from './environment.validation';

export interface AppConfiguration {
  nodeEnv: NodeEnvironment;
  port: number;
  timezone: string;
}

export interface DatabaseConfiguration {
  url: string;
  ssl: boolean;
}

export interface Configuration {
  app: AppConfiguration;
  database: DatabaseConfiguration;
}

export function buildConfiguration(env: EnvironmentVariables): Configuration {
  return {
    app: {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      timezone: env.APP_TIMEZONE,
    },
    database: {
      url: env.DATABASE_URL,
      ssl: env.DATABASE_SSL,
    },
  };
}

/** Factory registered in ConfigModule; read it with ConfigService<Configuration, true>. */
export default (): Configuration =>
  buildConfiguration(validateEnvironment(process.env));
