import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { Model } from 'mongoose';
import { MailService } from '../mail/mail.service';
import { RateLimiterService } from '../redis/rate-limiter.service';
import { CreateUserDto } from '../user/dto/user.dto';
import { UserService } from '../user/user.service';
import {
  GetOtpForRegistrationDto,
  VerifyOtpForRegistrationDto,
} from './dto/auth.dto';
import { Registration } from './entities/registration.entity';
import { AuthService } from './auth.service';
import { RegistrationResponse } from './types/response.type';

const OTP_EXPIRY_MINUTES = 10;
const COOLDOWN = { limit: 1, windowSeconds: 30, failOpen: false };
const HOURLY_LIMIT = {
  limit: 5,
  windowSeconds: 60 * 60,
  failOpen: false,
};

@Injectable()
export class RegistrationService {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly rateLimiter: RateLimiterService,
    @InjectModel(Registration.name)
    private readonly registrations: Model<Registration>,
  ) {}

  async register(user: CreateUserDto): Promise<RegistrationResponse> {
    const email = this.normalizeEmail(user.email);
    if (await this.userService.findOneByEmail({ email })) {
      throw new ConflictException('User with this email already exists');
    }

    const verified = await this.registrations.findOneAndDelete({
      registrationToken: user.registrationToken,
      email,
      otpExpiryTime: { $gt: new Date() },
    });
    if (!verified) {
      throw new BadRequestException('Invalid or expired registration token');
    }

    const created = await this.userService.create({
      ...user,
      email,
      password: await this.authService.hashPassword(user.password),
    });
    const accessToken = await this.authService.createSession(created);

    this.mailService
      .sendWelcome({ email, name: created.name })
      .catch(() => undefined);

    return { accessToken, user: this.userService.toPublic(created) };
  }

  async requestOtp(body: GetOtpForRegistrationDto) {
    const email = this.normalizeEmail(body.email);
    if (await this.userService.findOneByEmail({ email })) {
      throw new ConflictException('User with this email already exists');
    }
    await this.enforceLimit(email);

    const otp = randomInt(100_000, 1_000_000);
    await this.registrations.findOneAndUpdate(
      { email },
      {
        $set: {
          otpHash: this.hashOtp(email, otp),
          otpExpiryTime: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
        },
        $unset: { registrationToken: 1 },
      },
      { upsert: true },
    );
    await this.mailService.sendRegistrationOtp({
      email,
      otp,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });
    return { message: 'OTP sent successfully' };
  }

  async verifyOtp(body: VerifyOtpForRegistrationDto) {
    const email = this.normalizeEmail(body.email);
    const registrationToken = randomUUID();
    const registration = await this.registrations.findOneAndUpdate(
      {
        email,
        otpHash: this.hashOtp(email, body.otp),
        otpExpiryTime: { $gt: new Date() },
        registrationToken: { $exists: false },
      },
      { $set: { registrationToken } },
      { returnDocument: 'after' },
    );
    if (!registration) throw new BadRequestException('Invalid or expired OTP');
    return { registrationToken };
  }

  private async enforceLimit(email: string): Promise<void> {
    const key = `registration-otp:${email}`;
    const cooldown = await this.rateLimiter.hit(`${key}:cooldown`, COOLDOWN);
    if (!cooldown.allowed) {
      throw new HttpException(
        `Please wait ${cooldown.retryAfterSeconds} seconds before requesting another code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const hourly = await this.rateLimiter.hit(`${key}:hourly`, HOURLY_LIMIT);
    if (!hourly.allowed) {
      const minutes = Math.ceil(hourly.retryAfterSeconds / 60);
      throw new HttpException(
        `Too many codes requested for this email. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
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
