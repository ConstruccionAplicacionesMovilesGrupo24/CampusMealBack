import Joi from 'joi';

export const NODE_ENVIRONMENTS = ['development', 'production', 'test'] as const;
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  DATABASE_SSL: boolean;
  APP_TIMEZONE: string;

  // Reserved for later issues; optional until they are implemented.
  JWT_ACCESS_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
  JWT_ACCESS_TTL?: string;
  JWT_REFRESH_TTL?: string;
  ROUTE_PROVIDER_MODE?: 'deterministic' | 'external';
  ROUTE_PROVIDER_URL?: string;
  ROUTE_PROVIDER_API_KEY?: string;
  ROUTE_PROVIDER_TIMEOUT_MS?: number;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Only the variables required by Issue #1 are mandatory. Variables reserved
 * for later issues are accepted (and type-checked when present) but optional.
 * Error messages never include the rejected values, so secrets are not echoed.
 */
const environmentSchema = Joi.object<EnvironmentVariables>({
  NODE_ENV: Joi.string()
    .valid(...NODE_ENVIRONMENTS)
    .required(),
  PORT: Joi.number().port().required(),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DATABASE_SSL: Joi.boolean().default(false),
  APP_TIMEZONE: Joi.string()
    .required()
    .custom((value: string, helpers) =>
      isValidTimeZone(value) ? value : helpers.error('any.invalid'),
    )
    .messages({
      'any.invalid': '"APP_TIMEZONE" must be a valid IANA time zone',
    }),

  // Reserved for Issue #2 (authentication)
  JWT_ACCESS_SECRET: Joi.string().optional(),
  JWT_REFRESH_SECRET: Joi.string().optional(),
  JWT_ACCESS_TTL: Joi.string().optional(),
  JWT_REFRESH_TTL: Joi.string().optional(),

  // Reserved for the route-provider issue
  ROUTE_PROVIDER_MODE: Joi.string()
    .valid('deterministic', 'external')
    .optional(),
  ROUTE_PROVIDER_URL: Joi.string().uri().allow('').optional(),
  ROUTE_PROVIDER_API_KEY: Joi.string().allow('').optional(),
  ROUTE_PROVIDER_TIMEOUT_MS: Joi.number().integer().positive().optional(),
});

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const result = environmentSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
    convert: true,
  });

  if (result.error) {
    const problems = result.error.details.map(
      (detail) => `  - ${detail.message}`,
    );
    throw new Error(
      `Invalid environment configuration:\n${problems.join('\n')}\n` +
        'Check your .env file against .env.example.',
    );
  }

  return result.value;
}
