import { IsEmail, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class GetOtpForRegistrationDto {
  @IsNotEmpty()
  @IsEmail()
  email!: string;
}

export class VerifyOtpForRegistrationDto {
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNumber()
  @IsNotEmpty()
  otp!: number;
}

export class LoginDto {
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  password!: string;
}

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  oldPassword!: string;

  @IsNotEmpty()
  @IsString()
  newPassword!: string;
}

export class ForgotPasswordOtpDto {
  @IsNotEmpty()
  @IsString()
  email!: string;
}

export class ForgetPasswordOtpVerifyDto extends ForgotPasswordOtpDto {
  @IsNotEmpty()
  @IsNumber()
  otp!: number;

  @IsNotEmpty()
  @IsString()
  newPassword!: string;
}
