export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Each rule is checked separately so validation messages say exactly what is missing. */
export const PASSWORD_RULES = {
  uppercase: {
    pattern: /\p{Lu}/u,
    message: 'password must contain at least one uppercase letter',
  },
  lowercase: {
    pattern: /\p{Ll}/u,
    message: 'password must contain at least one lowercase letter',
  },
  number: {
    pattern: /\p{Nd}/u,
    message: 'password must contain at least one number',
  },
} as const;

export const PASSWORD_POLICY_DESCRIPTION = `${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters with at least one uppercase letter, one lowercase letter and one number.`;

/** Returns the unmet rules (empty when the password is acceptable). */
export function passwordPolicyViolations(password: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(
      `password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
    );
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(
      `password must be at most ${PASSWORD_MAX_LENGTH} characters long`,
    );
  }
  for (const rule of Object.values(PASSWORD_RULES)) {
    if (!rule.pattern.test(password)) {
      problems.push(rule.message);
    }
  }
  return problems;
}
