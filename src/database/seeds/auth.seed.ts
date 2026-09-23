import 'reflect-metadata';
import { isEmail } from 'class-validator';
import { passwordPolicyViolations } from '../../auth/password-policy';
import { PasswordService } from '../../auth/password.service';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { normalizeEmail } from '../../users/normalize-email';
import { UsersService } from '../../users/users.service';
import dataSource from '../data-source';

/**
 * Creates the demo USER and ANALYST accounts (npm run seed:auth).
 * Idempotent: existing accounts are reported and left untouched, passwords included.
 * Passwords come from DEMO_*_PASSWORD and are never printed.
 */

interface DemoAccount {
  label: string;
  role: UserRole;
  name: string;
  email: string;
  password: string;
}

function readAccount(
  prefix: 'DEMO_USER' | 'DEMO_ANALYST',
  role: UserRole,
  defaults: { name: string; email: string },
  problems: string[],
): DemoAccount {
  const name = (process.env[`${prefix}_NAME`] || defaults.name).trim();
  const email = normalizeEmail(
    process.env[`${prefix}_EMAIL`] || defaults.email,
  );
  const password = process.env[`${prefix}_PASSWORD`] ?? '';

  if (!name) problems.push(`${prefix}_NAME must not be blank`);
  if (!isEmail(email)) problems.push(`${prefix}_EMAIL must be a valid email`);
  if (!password) {
    problems.push(`${prefix}_PASSWORD is required`);
  } else {
    for (const violation of passwordPolicyViolations(password)) {
      problems.push(`${prefix}_PASSWORD: ${violation}`);
    }
  }
  return { label: prefix, role, name, email, password };
}

async function seed(): Promise<void> {
  const problems: string[] = [];
  const accounts = [
    readAccount(
      'DEMO_USER',
      UserRole.USER,
      { name: 'CampusMeal Demo', email: 'demo@campusmeal.local' },
      problems,
    ),
    readAccount(
      'DEMO_ANALYST',
      UserRole.ANALYST,
      { name: 'CampusMeal Analyst', email: 'analyst@campusmeal.local' },
      problems,
    ),
  ];
  if (accounts[0].email === accounts[1].email) {
    problems.push('DEMO_USER_EMAIL and DEMO_ANALYST_EMAIL must differ');
  }
  if (problems.length) {
    throw new Error(
      `Cannot seed demo users:\n  - ${problems.join('\n  - ')}\n` +
        'Set the DEMO_* variables in .env (see .env.example).',
    );
  }

  await dataSource.initialize();
  try {
    const users = new UsersService(dataSource.getRepository(User));
    const passwords = new PasswordService();

    for (const account of accounts) {
      const existing = await users.findByEmail(account.email);
      if (existing) {
        const note =
          existing.role === account.role
            ? ''
            : ` (warning: its role is ${existing.role}, expected ${account.role}; not changed)`;
        console.log(
          `[seed:auth] ${account.label}: ${account.email} already exists, left unchanged${note}`,
        );
        continue;
      }

      await users.create({
        name: account.name,
        email: account.email,
        passwordHash: await passwords.hash(account.password),
        role: account.role,
      });
      console.log(
        `[seed:auth] ${account.label}: created ${account.email} with role ${account.role}`,
      );
    }
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
