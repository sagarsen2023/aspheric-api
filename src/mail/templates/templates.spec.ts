import { forgotPasswordOtpTemplate } from './forgot-password-otp.template';
import { LOGO_PATH } from './layout.template';
import { registrationOtpTemplate } from './registration-otp.template';
import { welcomeTemplate } from './welcome.template';

const context = { consoleUrl: 'https://console.aspheric.app' };

describe('mail templates', () => {
  it('loads the logo from the console', () => {
    const { html } = registrationOtpTemplate(context, {
      email: 'ravi@zenpaycart.in',
      otp: 482913,
      expiresInMinutes: 10,
    });

    expect(html).toContain(`https://console.aspheric.app${LOGO_PATH}`);
  });

  it('shows the code and its expiry in both parts', () => {
    const { html, text } = forgotPasswordOtpTemplate(context, {
      name: 'Ravi Deshmukh',
      otp: 482913,
      expiresInMinutes: 10,
    });

    for (const part of [html, text]) {
      expect(part).toContain('482913');
      expect(part).toContain('expires in 10 minutes');
    }
    expect(text).toContain('Hi Ravi,');
  });

  it('escapes names so they cannot inject markup', () => {
    const { html, text } = welcomeTemplate(context, {
      name: '<img src=x onerror=alert(1)> Deshmukh',
    });

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(text).toContain('Open the console: https://console.aspheric.app');
  });
});
