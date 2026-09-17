export interface MailRecipient {
  email: string;
  name?: string;
}

/** A rendered email: what a template produces. */
export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

export interface MailMessage extends MailContent {
  to: MailRecipient;
  /** Shown in Brevo's logs, for filtering by email type. */
  tags?: string[];
}

/** Values every template needs to render links and the logo. */
export interface MailTemplateContext {
  consoleUrl: string;
}
