import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { uuid } from '../../utils/uuid';
import { ForgotPassword } from './entities/forgot-password.entity';
import { Auth } from './entities/auth.entity';
import { Registration } from './entities/registration.entity';
import { AuthParams } from './types/params.type';
import { RegistrationResponse } from './types/response.type';
import {
  ForgetPasswordOtpVerifyDto,
  ForgotPasswordOtpDto,
  GetOtpForRegistrationDto,
  LoginDto,
  ResetPasswordDto,
  VerifyOtpForRegistrationDto,
} from './dto/auth.dto';
import { UserService } from '../user/user.service';
import { CreateUserDto } from '../user/dto/user.dto';
import { UserDocument } from '../user/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    @InjectModel(Auth.name) private readonly authModel: Model<Auth>,
    @InjectModel(Registration.name)
    private readonly registrationModel: Model<Registration>,
    @InjectModel(ForgotPassword.name)
    private readonly forgotPasswordModel: Model<ForgotPassword>,
  ) {}

  async hashPassword(password: string) {
    const saltRounds = this.configService.get<number>('bcryptSaltRounds');
    const salt = await bcrypt.genSalt(saltRounds);
    return await bcrypt.hash(password, salt);
  }

  async signWithJwt(payload: AuthParams) {
    const accessToken = await this.jwtService.signAsync(payload);
    const newAuthEntry = new this.authModel({
      userId: payload._id,
      accessToken,
    });
    await newAuthEntry.save();
    return accessToken;
  }

  async register(user: CreateUserDto): Promise<RegistrationResponse> {
    const { registrationToken, email, password } = user;

    const isVerifiedUser = await this.registrationModel.findOne({
      registrationToken,
    });

    if (!isVerifiedUser) {
      throw new BadRequestException('Invalid registration token');
    }

    const isExists = await this.userService.findOneByEmail({ email });
    if (isExists) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await this.hashPassword(password);

    const newlyCreatedUser = await this.userService.create({
      ...user,
      password: hashedPassword,
    });

    const payload = {
      _id: newlyCreatedUser._id.toString(),
      role: newlyCreatedUser.role,
    };

    const accessToken = await this.signWithJwt(payload);

    await this.registrationModel.findByIdAndDelete(isVerifiedUser?._id);

    return { accessToken, user: newlyCreatedUser };
  }

  async login(user: LoginDto) {
    const { email, password } = user;

    let existingUser: UserDocument | null = null;
    if (email) {
      existingUser = await this.userService.findOneByEmail({
        email,
        includePassword: true,
      });
    }

    if (!existingUser) {
      throw new BadRequestException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      existingUser.password,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Invalid email or password');
    }

    const payload = {
      _id: existingUser?._id.toString(),
      role: existingUser.role,
    };
    const accessToken = await this.signWithJwt(payload);

    return { accessToken, user: existingUser };
  }

  async getProfile(userId: string) {
    return await this.userService.findOne({ id: userId });
  }

  async logout(userId: string) {
    await this.authModel.deleteMany({ userId });
  }

  async resetPassword({
    body,
    userId,
  }: {
    body: ResetPasswordDto;
    userId: string;
  }) {
    const { oldPassword, newPassword } = body;
    const user = await this.userService.findOne({
      id: userId,
      includePassword: true,
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    const isPasswordValid = await bcrypt.compare(
      oldPassword,
      user.password ?? '',
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Invalid old password');
    }
    const hashedPassword = await this.hashPassword(newPassword);

    await this.userService.updatePassword({ id: userId, hashedPassword });
    return { message: 'Password reset successfully' };
  }

  async getOtpForForgotPassword(body: ForgotPasswordOtpDto) {
    const { email } = body;
    const user = await this.userService.findOneByEmail({ email });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    const otp = this.generateOtp();
    const previousForgotPassword = await this.forgotPasswordModel.findOne({
      email,
    });
    if (previousForgotPassword) {
      await this.forgotPasswordModel.findByIdAndDelete(
        previousForgotPassword?._id,
      );
    }
    await this.forgotPasswordModel.create({
      email,
      otp,
      expiryTime: Date.now() + 10 * 60 * 1000,
    });
    this.sendOtp();
    return { message: 'OTP sent successfully' };
  }

  async verifyOtpForForgotPassword(body: ForgetPasswordOtpVerifyDto) {
    const { newPassword, email, otp } = body;
    const user = await this.userService.findOneByEmail({ email });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    const previousForgotPassword = await this.forgotPasswordModel.findOne({
      email,
    });
    if (
      !previousForgotPassword ||
      previousForgotPassword?.otp?.toString() !== otp.toString() ||
      new Date(previousForgotPassword.expiryTime ?? '') < new Date()
    ) {
      throw new BadRequestException('Invalid or expired OTP');
    }
    const hashedPassword = await this.hashPassword(newPassword);
    await this.userService.updatePassword({
      id: user._id.toString(),
      hashedPassword,
    });
    await this.forgotPasswordModel.deleteOne({ email });
    return { message: 'Password reset successfully' };
  }

  async validateToken(token: string): Promise<AuthParams> {
    try {
      const isJwtValid: AuthParams = await this.jwtService.verifyAsync(token);
      if (!isJwtValid) {
        throw new UnauthorizedException('Invalid token');
      }
      const tokenResponse = await this.authModel.findOne({
        accessToken: token,
      });
      if (!tokenResponse) {
        throw new UnauthorizedException('Invalid token');
      }
      const payload: AuthParams = await this.jwtService.verifyAsync(
        tokenResponse.accessToken,
      );
      return payload;
    } catch {
      throw new BadRequestException('Invalid token');
    }
  }

  generateOtp() {
    const isProduction =
      this.configService.get<string>('nodeEnvironment') === 'production';
    return isProduction ? Math.floor(1000 + Math.random() * 900000) : 123456;
  }

  sendOtp() {
    // TODO: send otp to phone number using sms service
  }

  async getOtpForRegistration(body: GetOtpForRegistrationDto) {
    const { email } = body;

    const otp = this.generateOtp();

    const isRegistered = await this.userService.findOneByEmail({
      email,
    });
    if (isRegistered) {
      throw new ConflictException('User with this email already exists');
    }

    // TODO: Include a rate limiter here
    const previousRegistration = await this.registrationModel.findOne({
      email,
    });

    if (previousRegistration) {
      await this.registrationModel.findByIdAndDelete(previousRegistration?._id);
    }

    await this.registrationModel.create({
      email,
      otp,
      otpExpiryTime: Date.now() + 10 * 60 * 1000,
    });

    this.sendOtp();

    return { message: 'OTP sent successfully' };
  }

  async verifyAndGetTokenForRegistration(body: VerifyOtpForRegistrationDto) {
    const { email, otp } = body;

    const previousRegistration = await this.registrationModel.findOne({
      email,
    });

    if (!previousRegistration) {
      throw new BadRequestException('Invalid email Id');
    }

    if (previousRegistration.otp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    if (previousRegistration.otpExpiryTime < new Date()) {
      throw new BadRequestException('OTP has expired');
    }

    return await this.registrationModel.findByIdAndUpdate(
      previousRegistration?._id,
      { registrationToken: uuid() },
      { returnDocument: 'after' },
    );
  }
}
