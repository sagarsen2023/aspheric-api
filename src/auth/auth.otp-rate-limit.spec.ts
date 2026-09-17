import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { RateLimiterService } from '../redis/rate-limiter.service';

// Vitest does not emit decorator metadata, so building the real User schema
// at import time fails. These tests pass their own doubles anyway.
vi.mock('../user/user.service', () => ({ UserService: class {} }));
vi.mock('../user/entities/user.entity', () => ({}));

/** AuthService with only what getOtpForRegistration touches. */
function createService(
  limits: { allowed: boolean; retryAfterSeconds: number }[],
) {
  const rateLimiter = { hit: vi.fn() };
  for (const limit of limits) rateLimiter.hit.mockResolvedValueOnce(limit);

  const userService = { findOneByEmail: vi.fn().mockResolvedValue(null) };
  const configService = { get: vi.fn().mockReturnValue('development') };
  const mailService = {
    sendRegistrationOtp: vi.fn().mockResolvedValue(undefined),
  };
  const registrationModel = {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
  };

  const service = new AuthService(
    {} as never,
    userService as never,
    configService as never,
    mailService as never,
    rateLimiter as unknown as RateLimiterService,
    {} as never,
    registrationModel as never,
    {} as never,
  );
  return { service, rateLimiter, mailService, registrationModel };
}

const allowed = { allowed: true, retryAfterSeconds: 30 };

describe('AuthService registration code rate limit', () => {
  it('sends the code when the email is within its limits', async () => {
    const { service, rateLimiter, mailService } = createService([
      allowed,
      allowed,
    ]);

    await service.getOtpForRegistration({ email: ' Ravi@ZenPayCart.in ' });

    expect(rateLimiter.hit.mock.calls.map(([key]) => key)).toEqual([
      'registration-otp:ravi@zenpaycart.in:cooldown',
      'registration-otp:ravi@zenpaycart.in:hourly',
    ]);
    expect(mailService.sendRegistrationOtp).toHaveBeenCalledOnce();
  });

  it('refuses a second code inside the cooldown, without sending', async () => {
    const { service, mailService, registrationModel } = createService([
      { allowed: false, retryAfterSeconds: 24 },
    ]);

    const request = service.getOtpForRegistration({
      email: 'ravi@zenpaycart.in',
    });

    await expect(request).rejects.toThrow(
      'Please wait 24 seconds before requesting another code.',
    );
    await expect(request).rejects.toBeInstanceOf(HttpException);
    expect(registrationModel.create).not.toHaveBeenCalled();
    expect(mailService.sendRegistrationOtp).not.toHaveBeenCalled();
  });

  it('refuses once the hourly cap is used up', async () => {
    const { service, mailService } = createService([
      allowed,
      { allowed: false, retryAfterSeconds: 1500 },
    ]);

    const error = await service
      .getOtpForRegistration({ email: 'ravi@zenpaycart.in' })
      .catch((caught: HttpException) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect((error as HttpException).message).toBe(
      'Too many codes requested for this email. Try again in 25 minutes.',
    );
    expect(mailService.sendRegistrationOtp).not.toHaveBeenCalled();
  });
});
