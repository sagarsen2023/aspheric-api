import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import type { BrevoProvider } from './providers/brevo.provider';

const mailSettings = {
  brevoApiKey: 'test-key',
  senderEmail: 'hello@aspheric.app',
  senderName: 'Aspheric',
  consoleUrl: 'https://console.aspheric.app',
};

function createService(nodeEnvironment: string) {
  const brevo = {
    isConfigured: true,
    send: vi.fn().mockResolvedValue('<message-id@brevo>'),
  };
  const configService = {
    get: vi.fn((key: string) =>
      key === 'nodeEnvironment' ? nodeEnvironment : undefined,
    ),
  };
  const service = new MailService(
    brevo as unknown as BrevoProvider,
    configService as unknown as ConfigService,
    mailSettings,
  );
  return { service, brevo };
}

describe('MailService', () => {
  it('does not send outside production', async () => {
    const { service, brevo } = createService('development');

    await service.sendRegistrationOtp({
      email: 'ravi@zenpaycart.in',
      otp: 123456,
      expiresInMinutes: 10,
    });

    expect(brevo.send).not.toHaveBeenCalled();
  });

  it('sends the registration code through Brevo in production', async () => {
    const { service, brevo } = createService('production');

    await service.sendRegistrationOtp({
      email: 'ravi@zenpaycart.in',
      otp: 482913,
      expiresInMinutes: 10,
    });

    expect(brevo.send).toHaveBeenCalledOnce();
    const message = brevo.send.mock.calls[0][0];
    expect(message.to).toEqual({ email: 'ravi@zenpaycart.in' });
    expect(message.tags).toEqual(['registration-otp']);
    expect(message.html).toContain('482913');
    expect(message.text).toContain('482913');
  });

  it('addresses the forgot password and welcome emails by name', async () => {
    const { service, brevo } = createService('production');

    await service.sendForgotPasswordOtp({
      email: 'ravi@zenpaycart.in',
      name: 'Ravi Deshmukh',
      otp: 482913,
      expiresInMinutes: 10,
    });
    await service.sendWelcome({
      email: 'ravi@zenpaycart.in',
      name: 'Ravi Deshmukh',
    });

    const [reset, welcome] = brevo.send.mock.calls.map(([message]) => message);
    expect(reset.to).toEqual({
      email: 'ravi@zenpaycart.in',
      name: 'Ravi Deshmukh',
    });
    expect(reset.tags).toEqual(['forgot-password-otp']);
    expect(welcome.tags).toEqual(['welcome']);
    expect(welcome.subject).toBe('Welcome to the Aspheric Console');
  });

  it('hides delivery failures behind a 503', async () => {
    const { service, brevo } = createService('production');
    brevo.send.mockRejectedValue(
      new Error('Brevo responded 401: unauthorized'),
    );

    await expect(
      service.sendWelcome({ email: 'ravi@zenpaycart.in', name: 'Ravi' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
