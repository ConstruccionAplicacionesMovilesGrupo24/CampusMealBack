import Joi from 'joi';

export const NODE_ENVIRONMENTS = ['development', 'production', 'test'] as const;
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  DATABASE_SSL: boolean;
  APP_TIMEZONE: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL: string;

  // Reserved for later issues; optional until they are implemented.
  ROUTE_PROVIDER_MODE?: 'deterministic' | 'valhalla' | 'external';
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

/** Durations such as `90s`, `15m`, `12h` or `7d`. */
const DURATION_PATTERN = /^([1-9]\d*)([smhd])$/;
const SECONDS_PER_UNIT = { s: 1, m: 60, h: 3600, d: 86400 } as const;

export function durationToSeconds(value: string): number {
  const match = DURATION_PATTERN.exec(value);
  if (!match) {
    throw new Error('Invalid duration format');
  }
  const unit = match[2] as keyof typeof SECONDS_PER_UNIT;
  return Number(match[1]) * SECONDS_PER_UNIT[unit];
}

export const JWT_SECRET_MIN_LENGTH = 32;
const PLACEHOLDER_MARKERS = [
  'replace',
  'changeme',
  'change-me',
  'change_me',
  'example',
  'placeholder',
  'secret',
  'password',
];

// Rejects template values and trivially weak strings. Randomly generated secrets pass.
function looksLikePlaceholder(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker)) ||
    new Set(value).size < 10
  );
}

const jwtSecret = () =>
  Joi.string()
    .required()
    .min(JWT_SECRET_MIN_LENGTH)
    .custom((value: string, helpers) =>
      looksLikePlaceholder(value) ? helpers.error('secret.placeholder') : value,
    )
    .messages({
      'secret.placeholder':
        '{#label} looks like a placeholder or weak value; generate a random secret (see docs/BACKEND_SETUP.md)',
    });

const duration = () =>
  Joi.string().required().pattern(DURATION_PATTERN).messages({
    'string.pattern.base':
      '{#label} must be a duration such as 90s, 15m, 12h or 7d',
  });

/**
 * Variables reserved for later issues are accepted (and type-checked when
 * present) but optional. Error messages never include the rejected values,
 * so secrets are not echoed.
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

  // Authentication (Issue #2)
  JWT_ACCESS_SECRET: jwtSecret(),
  JWT_REFRESH_SECRET: jwtSecret()
    .invalid(Joi.ref('JWT_ACCESS_SECRET'))
    .messages({
      'any.invalid':
        '{#label} must be a random value different from JWT_ACCESS_SECRET',
    }),
  JWT_ACCESS_TTL: duration(),
  JWT_REFRESH_TTL: duration(),

  // Reserved for the route-provider issue
  ROUTE_PROVIDER_MODE: Joi.string()
    .valid('deterministic', 'valhalla', 'external')
    .optional(),
  ROUTE_PROVIDER_URL: Joi.string().uri().allow('').optional(),
  ROUTE_PROVIDER_API_KEY: Joi.string().allow('').optional(),
  ROUTE_PROVIDER_TIMEOUT_MS: Joi.number().integer().positive().optional(),
});

function invalidEnvironment(problems: string[]): Error {
  return new Error(
    `Invalid environment configuration:\n${problems.join('\n')}\n` +
      'Check your .env file against .env.example.',
  );
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const result = environmentSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
    convert: true,
  });

  if (result.error) {
    throw invalidEnvironment(
      result.error.details.map((detail) => `  - ${detail.message}`),
    );
  }

  const env = result.value;
  if (
    durationToSeconds(env.JWT_ACCESS_TTL) >=
    durationToSeconds(env.JWT_REFRESH_TTL)
  ) {
    throw invalidEnvironment([
      '  - "JWT_ACCESS_TTL" must be shorter than "JWT_REFRESH_TTL"',
    ]);
  }

  return env;
}
