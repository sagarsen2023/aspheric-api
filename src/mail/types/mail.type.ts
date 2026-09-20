export interface MailRecipient {
  email: string;
  name?: string;
}

export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

export interface MailMessage extends MailContent {
  to: MailRecipient;
  tags?: string[];
}

export interface MailTemplateContext {
  consoleUrl: string;
  logoUrl: string;
}
