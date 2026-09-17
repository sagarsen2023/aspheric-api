import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { mailConfig } from './mail.config';
import { BrevoProvider } from './providers/brevo.provider';
import { MailMessage, MailTemplateContext } from './types/mail.type';
import { registrationOtpTemplate } from './templates/registration-otp.template';
import { forgotPasswordOtpTemplate } from './templates/forgot-password-otp.template';
import { welcomeTemplate } from './templates/welcome.template';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly brevo: BrevoProvider,
    private readonly configService: ConfigService,
    @Inject(mailConfig.KEY)
    private readonly config: ConfigType<typeof mailConfig>,
  ) {}

  onModuleInit(): void {
    if (this.isProduction && !this.brevo.isConfigured) {
      this.logger.error(
        'BREVO_API_KEY and MAIL_SENDER_EMAIL are not set; emails will fail to send.',
      );
    }
  }

  sendRegistrationOtp(data: {
    email: string;
    otp: number;
    expiresInMinutes: number;
  }): Promise<void> {
    return this.send({
      to: { email: data.email },
      tags: ['registration-otp'],
      ...registrationOtpTemplate(this.templateContext, data),
    });
  }

  sendForgotPasswordOtp(data: {
    email: string;
    name: string;
    otp: number;
    expiresInMinutes: number;
  }): Promise<void> {
    return this.send({
      to: { email: data.email, name: data.name },
      tags: ['forgot-password-otp'],
      ...forgotPasswordOtpTemplate(this.templateContext, data),
    });
  }

  sendWelcome(data: { email: string; name: string }): Promise<void> {
    return this.send({
      to: { email: data.email, name: data.name },
      tags: ['welcome'],
      ...welcomeTemplate(this.templateContext, data),
    });
  }

  private get isProduction(): boolean {
    return this.configService.get<string>('nodeEnvironment') === 'production';
  }

  private get templateContext(): MailTemplateContext {
    return { consoleUrl: this.config.consoleUrl };
  }

  private async send(message: MailMessage): Promise<void> {
    if (!this.isProduction) {
      this.logger.log(
        `Not sending "${message.subject}" to ${message.to.email}: emails are only sent in production.`,
      );
      return;
    }

    try {
      const messageId = await this.brevo.send(message);
      this.logger.log(
        `Sent "${message.subject}"${messageId ? ` (${messageId})` : ''}.`,
      );
    } catch (error) {
      this.logger.error(
        `Could not send "${message.subject}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException(
        "We couldn't send the email right now. Please try again in a few minutes.",
      );
    }
  }
}
