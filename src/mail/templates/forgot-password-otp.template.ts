import { MailContent, MailTemplateContext } from '../types/mail.type';
import {
  codeBlock,
  escapeHtml,
  firstName,
  mutedNote,
  paragraph,
  renderLayout,
  renderText,
} from './layout.template';

interface ForgotPasswordOtpTemplateData {
  name: string;
  otp: number;
  expiresInMinutes: number;
}

/** Sent when a user asks to reset a forgotten password. */
export function forgotPasswordOtpTemplate(
  context: MailTemplateContext,
  { name, otp, expiresInMinutes }: ForgotPasswordOtpTemplateData,
): MailContent {
  const subject = 'Reset your Aspheric password';
  const greeting = firstName(name) ? `Hi ${firstName(name)},` : 'Hi,';
  const expiry = `This code expires in ${expiresInMinutes} minutes.`;

  const html = renderLayout(context, {
    subject,
    preheader: `Your password reset code is ${otp}. ${expiry}`,
    eyebrow: 'Password reset',
    title: 'Reset your password',
    content: [
      paragraph(escapeHtml(greeting)),
      paragraph(
        'We received a request to reset the password for your Aspheric Console account. Enter this code on the reset screen, then choose a new password.',
      ),
      codeBlock(otp),
      mutedNote(`${expiry} Never share it with others.`),
      mutedNote(
        'Didn&rsquo;t ask for a reset? Ignore this email and your password stays the same.',
      ),
    ].join('\n'),
    footerNote:
      'You received this email because a password reset was requested for your Aspheric Console account.',
  });

  const text = renderText([
    greeting,
    '',
    'We received a request to reset the password for your Aspheric Console account. Enter this code on the reset screen, then choose a new password:',
    '',
    String(otp),
    '',
    `${expiry} Never share it - Aspheric will never ask you for it.`,
    '',
    "Didn't ask for a reset? Ignore this email and your password stays the same.",
  ]);

  return { subject, html, text };
}
