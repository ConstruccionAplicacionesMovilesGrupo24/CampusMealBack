import {
  durationToSeconds,
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

export interface AuthConfiguration {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

export interface Configuration {
  app: AppConfiguration;
  database: DatabaseConfiguration;
  auth: AuthConfiguration;
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
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtlSeconds: durationToSeconds(env.JWT_ACCESS_TTL),
      refreshTtlSeconds: durationToSeconds(env.JWT_REFRESH_TTL),
    },
  };
}

/** Factory registered in ConfigModule; read it with ConfigService<Configuration, true>. */
export default (): Configuration =>
  buildConfiguration(validateEnvironment(process.env));
