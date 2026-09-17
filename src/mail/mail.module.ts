import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { mailConfig } from './mail.config';
import { MailService } from './mail.service';
import { BrevoProvider } from './providers/brevo.provider';

@Module({
  imports: [ConfigModule.forFeature(mailConfig)],
  providers: [MailService, BrevoProvider],
  exports: [MailService],
})
export class MailModule {}
