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

const reviewSteps = [
  {
    title: 'Check your website',
    body: 'Run a readiness scan across key areas including security, performance, accessibility, SEO, and delivery.',
  },
  {
    title: 'Understand what needs attention',
    body: 'Review clear, evidence-backed findings organized by category and severity, so you can focus on the issues that matter first.',
  },
  {
    title: 'Check your DPDP readiness',
    body: 'Use the free DPDP readiness checker to understand your current data-protection posture and identify areas that may need improvement.',
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
    preheader:
      'Your account is ready. Continue your website and DPDP readiness journey.',
    eyebrow: 'Account created',
    title: first
      ? `Welcome to the console, ${escapeHtml(first)}`
      : 'Welcome to the console',
    content: [
      paragraph(
        'Your account is ready. The Aspheric Console is where you can continue your website readiness journey, review findings, and understand what needs attention next.',
      ),
      steps(reviewSteps),
      button(context.consoleUrl, 'Open the console &rarr;'),
      divider(),
      mutedNote(
        `Want to check another website? Start with the ${link(websiteCheckUrl, 'free website readiness check')} and continue in the console when you are ready.`,
      ),
    ].join('\n'),
    footerNote:
      'You received this email because you created an account on the Aspheric Console.',
  });

  const text = renderText([
    first ? `Welcome to the console, ${first}` : 'Welcome to the console',
    '',
    'Your account is ready. The Aspheric Console is where you can continue your website readiness journey, review findings, and understand what needs attention next.',
    '',
    ...reviewSteps.map(
      (step, index) => `${index + 1}. ${step.title}: ${step.body}`,
    ),
    '',
    `Open the console: ${context.consoleUrl}`,
    '',
    `Want to check another website? Start with the free website readiness check and continue in the console when you are ready: ${websiteCheckUrl}`,
  ]);

  return { subject, html, text };
}
