import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Auth, AuthSchema } from './entities/auth.entity';
import {
  Registration,
  RegistrationSchema,
} from './entities/registration.entity';
import {
  ForgotPassword,
  ForgotPasswordSchema,
} from './entities/forgot-password.entity';
import { UserModule } from '../user/user.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Auth.name,
        schema: AuthSchema,
      },
      {
        name: Registration.name,
        schema: RegistrationSchema,
      },
      {
        name: ForgotPassword.name,
        schema: ForgotPasswordSchema,
      },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwtSecret'),
        signOptions: {
          expiresIn: config.get<number>('jwtExpirationTime'),
        },
      }),
    }),
    UserModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
