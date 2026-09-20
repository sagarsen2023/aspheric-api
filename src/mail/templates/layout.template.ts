import { MailTemplateContext } from '../types/mail.type';

const color = {
  page: '#f5f5f4',
  card: '#ffffff',
  brand: '#1c1917',
  heading: '#0c0a09',
  body: '#44403c',
  muted: '#78716c',
  subtle: '#a8a29e',
  border: '#e7e5e4',
  onBrand: '#fafaf9',
};

const font =
  "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const monoFont =
  "'Geist Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

export function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${font};font-size:15px;line-height:24px;color:${color.body};">${html}</p>`;
}

export function mutedNote(html: string): string {
  return `<p style="margin:0 0 12px;font-family:${font};font-size:13px;line-height:20px;color:${color.muted};">${html}</p>`;
}

export function link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${color.heading};font-weight:600;text-decoration:underline;">${label}</a>`;
}

export function codeBlock(code: string | number): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr>
    <td align="center" style="background:${color.page};border:1px solid ${color.border};border-radius:12px;padding:22px 12px;">
      <div class="code" style="font-family:${monoFont};font-size:34px;line-height:40px;font-weight:600;letter-spacing:12px;padding-left:12px;color:${color.heading};">${escapeHtml(code)}</div>
    </td>
  </tr>
</table>`;
}

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr>
    <td style="border-radius:999px;background:${color.brand};">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 28px;border-radius:999px;font-family:${font};font-size:14px;line-height:20px;font-weight:600;color:${color.onBrand};text-decoration:none;">${label}</a>
    </td>
  </tr>
</table>`;
}

export function steps(items: { title: string; body: string }[]): string {
  const rows = items
    .map(
      (item, index) => `<tr>
    <td valign="top" width="36" style="padding:0 0 18px;">
      <div style="width:26px;height:26px;border-radius:999px;background:${color.page};border:1px solid ${color.border};font-family:${font};font-size:12px;line-height:26px;font-weight:600;text-align:center;color:${color.heading};">${index + 1}</div>
    </td>
    <td valign="top" style="padding:2px 0 18px;font-family:${font};font-size:15px;line-height:22px;color:${color.body};">
      <strong style="color:${color.heading};font-weight:600;">${item.title}</strong><br>${item.body}
    </td>
  </tr>`,
    )
    .join('\n');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;">
  ${rows}
</table>`;
}

export function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td style="border-top:1px solid ${color.border};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

function isReachableLogoUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  return (
    (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  );
}

function logo(context: MailTemplateContext): string {
  const wordmark = `font-family:${font};font-size:16px;line-height:25px;font-weight:600;letter-spacing:4px;color:${color.onBrand};`;

  if (!isReachableLogoUrl(context.logoUrl)) {
    return `<span style="display:inline-block;${wordmark}">ASPHERIC</span>`;
  }

  return `<img src="${escapeHtml(context.logoUrl)}" width="149" height="25" alt="ASPHERIC" style="display:block;border:0;outline:none;text-decoration:none;${wordmark}">`;
}

interface LayoutOptions {
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  content: string;
  footerNote: string;
}

export function renderLayout(
  context: MailTemplateContext,
  options: LayoutOptions,
): string {
  const preheaderPadding = '&#847;&zwnj;&nbsp;'.repeat(60);

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(options.subject)}</title>
  <style>
    @media (max-width: 620px) {
      .container { width: 100% !important; }
      .px { padding-left: 24px !important; padding-right: 24px !important; }
      .code { font-size: 28px !important; letter-spacing: 8px !important; padding-left: 8px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${color.page};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(options.preheader)}${preheaderPadding}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${color.page};">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
          <tr>
            <td class="px" style="background:${color.brand};border-radius:16px 16px 0 0;padding:26px 40px;">
              <a href="${escapeHtml(context.consoleUrl)}" style="text-decoration:none;">
                ${logo(context)}
              </a>
            </td>
          </tr>
          <tr>
            <td class="px" style="background:${color.card};border:1px solid ${color.border};border-top:0;border-radius:0 0 16px 16px;padding:40px 40px 28px;">
              <p style="margin:0 0 12px;font-family:${font};font-size:11px;line-height:16px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${color.muted};">${escapeHtml(options.eyebrow)}</p>
              <h1 style="margin:0 0 16px;font-family:${font};font-size:26px;line-height:32px;font-weight:600;letter-spacing:-0.4px;color:${color.heading};">${options.title}</h1>
              ${options.content}
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 40px 0;">
              <p style="margin:0 0 6px;font-family:${font};font-size:12px;line-height:18px;font-weight:600;color:${color.muted};">Aspheric &middot; Know before the store does.</p>
              <p style="margin:0;font-family:${font};font-size:12px;line-height:18px;color:${color.subtle};">${options.footerNote}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderText(lines: string[]): string {
  return [...lines, '', '--', 'Aspheric · Know before the store does.'].join(
    '\n',
  );
}
