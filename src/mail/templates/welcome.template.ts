import { MailContent, MailTemplateContext } from '../types/mail.type';
import {
  button,
  divider,
  escapeHtml,
  firstName,
  link,
  mutedNote,
  paragraph,
  renderLayout,
  renderText,
  steps,
} from './layout.template';

interface WelcomeTemplateData {
  name: string;
}

// How a review works, as published on the Aspheric landing page.
const reviewSteps = [
  {
    title: 'Upload your build',
    body: 'Send the .aab or .ipa you were about to publish. We never ask for access to your repository.',
  },
  {
    title: 'A reviewer reads it',
    body: 'A person checks permissions, store-policy traps, business logic and whether your privacy policy matches what the app really does.',
  },
  {
    title: 'Get a clear verdict',
    body: 'GO, FIX THESE or NO-GO in 2&ndash;3 working days, with a ranked fix list.',
  },
];

/** Sent once a console account has been created. */
export function welcomeTemplate(
  context: MailTemplateContext,
  { name }: WelcomeTemplateData,
): MailContent {
  const subject = 'Welcome to the Aspheric Console';
  const first = firstName(name);
  const websiteCheckUrl = `${context.consoleUrl}/website-check`;

  const html = renderLayout(context, {
    subject,
    preheader: 'Your account is ready. Here is how a build review works.',
    eyebrow: 'Account created',
    title: first
      ? `Welcome to the console, ${escapeHtml(first)}`
      : 'Welcome to the console',
    content: [
      paragraph(
        'Your account is ready. The Aspheric Console is where you send a build before it goes to the store &mdash; and where a clear answer comes back.',
      ),
      steps(reviewSteps),
      button(context.consoleUrl, 'Open the console &rarr;'),
      divider(),
      mutedNote(
        `Not ready to send a build? The ${link(websiteCheckUrl, 'website readiness check')} is free, as often as you like.`,
      ),
    ].join('\n'),
    footerNote:
      'You received this email because you created an account on the Aspheric Console.',
  });

  const text = renderText([
    first ? `Welcome to the console, ${first}` : 'Welcome to the console',
    '',
    'Your account is ready. The Aspheric Console is where you send a build before it goes to the store - and where a clear answer comes back.',
    '',
    ...reviewSteps.map(
      (step, index) =>
        `${index + 1}. ${step.title}: ${step.body.replace(/&ndash;/g, '-')}`,
    ),
    '',
    `Open the console: ${context.consoleUrl}`,
    '',
    `Not ready to send a build? The website readiness check is free, as often as you like: ${websiteCheckUrl}`,
  ]);

  return { subject, html, text };
}
