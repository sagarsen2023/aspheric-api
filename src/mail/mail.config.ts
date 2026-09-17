import { registerAs } from '@nestjs/config';

export const MAIL_CONFIG_NAMESPACE = 'mail';

export interface MailConfig {
  brevoApiKey?: string;
  senderEmail?: string;
  senderName: string;
  consoleUrl: string;
}

export const mailConfig = registerAs(MAIL_CONFIG_NAMESPACE, (): MailConfig => ({
  brevoApiKey: process.env.BREVO_API_KEY || undefined,
  senderEmail: process.env.MAIL_SENDER_EMAIL || undefined,
  senderName: process.env.MAIL_SENDER_NAME || 'Aspheric',
  consoleUrl: process.env.CONSOLE_URL || 'http://localhost:5173',
}));
