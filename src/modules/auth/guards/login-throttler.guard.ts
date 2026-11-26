import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Brute-force protection keyed by (IP, login). Restaurants often put every
 * terminal behind one public IP, so limiting by IP alone would lock out the
 * whole staff at shift start.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(
    request: Record<string, unknown>,
  ): Promise<string> {
    const body = request.body as { login?: unknown } | undefined;
    const login =
      typeof body?.login === 'string' ? body.login.trim().toLowerCase() : '';
    const ip = typeof request.ip === 'string' ? request.ip : 'unknown';
    return Promise.resolve(`${ip}:${login}`);
  }
}
