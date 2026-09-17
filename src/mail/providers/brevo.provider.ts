import { Inject, Injectable } from '@nestjs/common';
// `import type`: emitDecoratorMetadata cannot reference a value-imported type
// under isolatedModules.
import type { ConfigType } from '@nestjs/config';
import { mailConfig } from '../mail.config';
import { MailMessage } from '../types/mail.type';

const BREVO_SEND_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 10_000;

/** Delivers transactional email through Brevo's HTTP API. */
@Injectable()
export class BrevoProvider {
  constructor(
    @Inject(mailConfig.KEY)
    private readonly config: ConfigType<typeof mailConfig>,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.config.brevoApiKey && this.config.senderEmail);
  }

  /** Resolves with Brevo's message id; rejects if Brevo does not accept the email. */
  async send(message: MailMessage): Promise<string | undefined> {
    const { brevoApiKey, senderEmail, senderName } = this.config;
    if (!brevoApiKey || !senderEmail) {
      throw new Error(
        'Brevo is not configured: set BREVO_API_KEY and MAIL_SENDER_EMAIL.',
      );
    }

    const response = await fetch(BREVO_SEND_EMAIL_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [message.to],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        tags: message.tags,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Brevo responded ${response.status}: ${detail}`);
    }

    const body = (await response.json().catch(() => ({}))) as {
      messageId?: string;
    };
    return body.messageId;
  }
}
