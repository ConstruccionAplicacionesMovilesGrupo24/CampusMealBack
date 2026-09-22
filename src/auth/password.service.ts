import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Argon2id with the library's secure defaults (64 MiB memory, 3 iterations,
 * parallelism 4). Used by registration, login and the demo-user seed.
 */
@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  /** Constant-time comparison happens inside argon2.verify. */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Spends the same work as a real verification when the email is unknown, so
   * response timing does not reveal whether an account exists.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('campusmeal-timing-equalizer');
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
