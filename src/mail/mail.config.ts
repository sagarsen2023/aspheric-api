import { registerAs } from '@nestjs/config';

export const MAIL_CONFIG_NAMESPACE = 'mail';

const LOGO_PATH = '/mail/aspheric-lockup-white.png';

export interface MailConfig {
  brevoApiKey?: string;
  senderEmail?: string;
  senderName: string;
  consoleUrl: string;
  logoUrl: string;
}

export const mailConfig = registerAs(MAIL_CONFIG_NAMESPACE, (): MailConfig => {
  const consoleUrl = (
    process.env.CONSOLE_URL || 'http://localhost:5173'
  ).replace(/\/+$/, '');

  return {
    brevoApiKey: process.env.BREVO_API_KEY || undefined,
    senderEmail: process.env.MAIL_SENDER_EMAIL || undefined,
    senderName: process.env.MAIL_SENDER_NAME || 'Aspheric',
    consoleUrl,
    logoUrl: process.env.MAIL_LOGO_URL || `${consoleUrl}${LOGO_PATH}`,
  };
});
