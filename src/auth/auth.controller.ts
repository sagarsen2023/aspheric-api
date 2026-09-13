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
import { errorHandler } from '../../config/error-handler';
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
import { AuthGuard } from './guards/auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post('get-otp-for-registration')
  async getOtp(@Body() body: GetOtpForRegistrationDto) {
    try {
      return await this.authService.getOtpForRegistration(body);
    } catch (e) {
      errorHandler(e);
    }
  }

  @Post('verify-otp-for-registration')
  async verifyOtp(@Body() body: VerifyOtpForRegistrationDto) {
    try {
      return await this.authService.verifyAndGetTokenForRegistration(body);
    } catch (e) {
      errorHandler(e);
    }
  }

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    try {
      return await this.authService.register(createUserDto);
    } catch (e) {
      errorHandler(e);
    }
  }

  @Post('login')
  async login(@Body() loginUserDto: LoginDto) {
    try {
      return await this.authService.login(loginUserDto);
    } catch (e) {
      errorHandler(e);
    }
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  async getProfile(@Req() req) {
    try {
      const userId = req.user._id as string;
      return await this.authService.getProfile(userId);
    } catch (e) {
      errorHandler(e);
    }
  }

  @Patch('profile')
  @UseGuards(AuthGuard)
  async updateProfile(@Req() req, @Body() updateData: Partial<CreateUserDto>) {
    try {
      const userId = req.user._id as string;
      return await this.userService.update({
        id: userId,
        updateUserDto: updateData,
      });
    } catch (e) {
      errorHandler(e);
    }
  }

  @Delete('logout')
  @UseGuards(AuthGuard)
  async logout(@Req() req) {
    try {
      const userId = req.user._id as string;
      await this.authService.logout(userId);
      return { message: 'Logged out successfully' };
    } catch (e) {
      errorHandler(e);
    }
  }

  @Patch('reset-password')
  @UseGuards(AuthGuard)
  async resetPassword(@Req() req, @Body() body: ResetPasswordDto) {
    try {
      const userId = req.user._id as string;
      return await this.authService.resetPassword({ body, userId });
    } catch (e) {
      errorHandler(e);
    }
  }

  @Post('get-otp-for-forgot-password')
  async getOtpForForgotPassword(@Body() body: ForgotPasswordOtpDto) {
    try {
      return await this.authService.getOtpForForgotPassword(body);
    } catch (e) {
      errorHandler(e);
    }
  }

  @Post('verify-otp-for-forgot-password')
  async verifyOtpForForgotPassword(@Body() body: ForgetPasswordOtpVerifyDto) {
    try {
      return await this.authService.verifyOtpForForgotPassword(body);
    } catch (e) {
      errorHandler(e);
    }
  }
}
