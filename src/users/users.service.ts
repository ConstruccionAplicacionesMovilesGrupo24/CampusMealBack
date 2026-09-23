import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { ErrorCode } from '../common/enums/error-code.enum';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { normalizeEmail } from './normalize-email';

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}

const UNIQUE_VIOLATION = '23505';
const EMAIL_UNIQUE_CONSTRAINT = 'UQ_users_email';

export function emailAlreadyRegistered(): ConflictException {
  return new ConflictException({
    code: ErrorCode.EMAIL_ALREADY_REGISTERED,
    message: 'An account with this email already exists',
  });
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as {
    code?: string;
    constraint?: string;
  };
  return (
    driverError.code === UNIQUE_VIOLATION &&
    driverError.constraint === EMAIL_UNIQUE_CONSTRAINT
  );
}

/** The small set of user persistence operations needed by authentication. */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: normalizeEmail(email) });
  }

  /** Only for credential checks: includes the otherwise hidden password hash. */
  findByEmailWithPasswordHash(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  /**
   * Inserts a user. A duplicate email always becomes 409 EMAIL_ALREADY_REGISTERED,
   * including when two registrations race and PostgreSQL's unique constraint fires.
   */
  async create(data: CreateUserData, manager?: EntityManager): Promise<User> {
    const repository = manager ? manager.getRepository(User) : this.users;
    const user = repository.create({
      name: data.name.trim(),
      email: normalizeEmail(data.email),
      passwordHash: data.passwordHash,
      role: data.role ?? UserRole.USER,
    });

    try {
      return await repository.save(user);
    } catch (error) {
      if (isEmailUniqueViolation(error)) {
        throw emailAlreadyRegistered();
      }
      throw error;
    }
  }
}
