import { MailContent, MailTemplateContext } from '../types/mail.type';
import {
  codeBlock,
  escapeHtml,
  mutedNote,
  paragraph,
  renderLayout,
  renderText,
} from './layout.template';

interface RegistrationOtpTemplateData {
  email: string;
  otp: number;
  expiresInMinutes: number;
}

/** Sent when someone starts creating a console account. */
export function registrationOtpTemplate(
  context: MailTemplateContext,
  { email, otp, expiresInMinutes }: RegistrationOtpTemplateData,
): MailContent {
  const subject = 'Verify your email for the Aspheric Console';
  const expiry = `This code expires in ${expiresInMinutes} minutes.`;

  const html = renderLayout(context, {
    subject,
    preheader: `Your verification code is ${otp}. ${expiry}`,
    eyebrow: 'Verify your email',
    title: 'Confirm it&rsquo;s you',
    content: [
      paragraph(
        `Enter this code in the console to verify <strong style="color:#0c0a09;">${escapeHtml(email)}</strong> and finish creating your account.`,
      ),
      codeBlock(otp),
      mutedNote(
        `${expiry} Never share it with others.`,
      ),
      mutedNote(
        'Didn&rsquo;t try to create an account? You can ignore this email. No account is created until the code is entered.',
      ),
    ].join('\n'),
    footerNote: `You received this email because ${escapeHtml(email)} was used to sign up for the Aspheric Console.`,
  });

  const text = renderText([
    'Verify your email for the Aspheric Console',
    '',
    `Enter this code in the console to verify ${email} and finish creating your account:`,
    '',
    String(otp),
    '',
    `${expiry} Never share it - Aspheric will never ask you for it.`,
    '',
    "Didn't try to create an account? You can ignore this email. No account is created until the code is entered.",
  ]);

  return { subject, html, text };
}
