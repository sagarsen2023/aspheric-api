import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, randomInt } from 'node:crypto';
import { Model } from 'mongoose';
import { MailService } from '../mail/mail.service';
import { RateLimiterService } from '../redis/rate-limiter.service';
import { UserService } from '../user/user.service';
import {
  ForgetPasswordOtpVerifyDto,
  ForgotPasswordOtpDto,
} from './dto/auth.dto';
import { ForgotPassword } from './entities/forgot-password.entity';
import { AuthService } from './auth.service';

const OTP_EXPIRY_MINUTES = 10;
const COOLDOWN = { limit: 1, windowSeconds: 60, failOpen: false };
const HOURLY_LIMIT = {
  limit: 5,
  windowSeconds: 60 * 60,
  failOpen: false,
};
const VERIFY_LIMIT = {
  limit: 5,
  windowSeconds: 10 * 60,
  failOpen: false,
};

@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly rateLimiter: RateLimiterService,
    @InjectModel(ForgotPassword.name)
    private readonly requests: Model<ForgotPassword>,
  ) {}

  async requestOtp(body: ForgotPasswordOtpDto) {
    const email = this.normalizeEmail(body.email);
    await this.enforceRequestLimit(email);
    const user = await this.userService.findOneByEmail({ email });
    if (!user) return this.sentResponse;

    const otp = randomInt(100_000, 1_000_000);
    await this.requests.findOneAndUpdate(
      { email },
      {
        $set: {
          otpHash: this.hashOtp(email, otp),
          expiryTime: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
        },
      },
      { upsert: true },
    );
    await this.mailService.sendForgotPasswordOtp({
      email,
      name: user.name,
      otp,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });
    return this.sentResponse;
  }

  async reset(body: ForgetPasswordOtpVerifyDto) {
    const email = this.normalizeEmail(body.email);
    const verification = await this.rateLimiter.hit(
      `password-reset-verify:${email}`,
      VERIFY_LIMIT,
    );
    if (!verification.allowed) {
      throw new HttpException(
        'Too many attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const request = await this.requests.findOneAndDelete({
      email,
      otpHash: this.hashOtp(email, body.otp),
      expiryTime: { $gt: new Date() },
    });
    const user = await this.userService.findOneByEmail({ email });
    if (!request || !user) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.userService.updatePassword({
      id: user._id.toString(),
      hashedPassword: await this.authService.hashPassword(body.newPassword),
    });
    await this.authService.revokeUserSessions(user._id.toString());
    return { message: 'Password reset successfully' };
  }

  private async enforceRequestLimit(email: string): Promise<void> {
    for (const [suffix, rule] of [
      ['cooldown', COOLDOWN],
      ['hourly', HOURLY_LIMIT],
    ] as const) {
      const result = await this.rateLimiter.hit(
        `password-reset:${email}:${suffix}`,
        rule,
      );
      if (!result.allowed) {
        throw new HttpException(
          'Too many reset requests. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private get sentResponse() {
    return { message: 'If that account exists, an OTP has been sent' };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashOtp(email: string, otp: number): string {
    return createHmac('sha256', this.config.getOrThrow<string>('jwtSecret'))
      .update(`${email}:${otp}`)
      .digest('hex');
  }
}
