import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  ForgetPasswordOtpVerifyDto,
  ForgotPasswordOtpDto,
  GetOtpForRegistrationDto,
  LoginDto,
  ResetPasswordDto,
  VerifyOtpForRegistrationDto,
} from './dto/auth.dto';
import { UserService } from '../user/user.service';
import { CreateUserDto, UpdateProfileDto } from '../user/dto/user.dto';
import { AuthGuard } from './guards/auth.guard';
import type { Request } from 'express';
import type { AuthParams } from './types/params.type';
import { RegistrationService } from './registration.service';
import { PasswordRecoveryService } from './password-recovery.service';

type AuthenticatedRequest = Request & { user: AuthParams; authToken: string };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly registrationService: RegistrationService,
    private readonly passwordRecoveryService: PasswordRecoveryService,
    private readonly userService: UserService,
  ) {}

  @Post('get-otp-for-registration')
  async getOtp(@Body() body: GetOtpForRegistrationDto) {
    return this.registrationService.requestOtp(body);
  }

  @Post('verify-otp-for-registration')
  async verifyOtp(@Body() body: VerifyOtpForRegistrationDto) {
    return this.registrationService.verifyOtp(body);
  }

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.registrationService.register(createUserDto);
  }

  @Post('login')
  async login(@Body() loginUserDto: LoginDto) {
    return this.authService.login(loginUserDto);
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user._id);
  }

  @Patch('profile')
  @UseGuards(AuthGuard)
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() updateData: UpdateProfileDto,
  ) {
    const user = await this.userService.update({
      id: req.user._id,
      updateUserDto: updateData,
    });
    return user ? this.userService.toPublic(user) : null;
  }

  @Delete('logout')
  @UseGuards(AuthGuard)
  async logout(@Req() req: AuthenticatedRequest) {
    await this.authService.logout(req.authToken);
    return { message: 'Logged out successfully' };
  }

  @Patch('reset-password')
  @UseGuards(AuthGuard)
  async resetPassword(
    @Req() req: AuthenticatedRequest,
    @Body() body: ResetPasswordDto,
  ) {
    return this.authService.resetPassword({ body, userId: req.user._id });
  }

  @Post('get-otp-for-forgot-password')
  async getOtpForForgotPassword(@Body() body: ForgotPasswordOtpDto) {
    return this.passwordRecoveryService.requestOtp(body);
  }

  @Post('verify-otp-for-forgot-password')
  async verifyOtpForForgotPassword(@Body() body: ForgetPasswordOtpVerifyDto) {
    return this.passwordRecoveryService.reset(body);
  }
}
