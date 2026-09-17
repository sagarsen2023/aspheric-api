import { BrevoProvider } from './brevo.provider';

const settings = {
  brevoApiKey: 'test-key',
  senderEmail: 'hello@aspheric.app',
  senderName: 'Aspheric',
  consoleUrl: 'https://console.aspheric.app',
};

const message = {
  to: { email: 'ravi@zenpaycart.in', name: 'Ravi Deshmukh' },
  subject: 'Welcome to the Aspheric Console',
  html: '<p>Hello</p>',
  text: 'Hello',
  tags: ['welcome'],
};

describe('BrevoProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the email to Brevo and returns the message id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messageId: '<id@brevo>' }), {
        status: 201,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const messageId = await new BrevoProvider(settings).send(message);

    expect(messageId).toBe('<id@brevo>');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('test-key');
    expect(JSON.parse(init.body)).toEqual({
      sender: { email: 'hello@aspheric.app', name: 'Aspheric' },
      to: [{ email: 'ravi@zenpaycart.in', name: 'Ravi Deshmukh' }],
      subject: 'Welcome to the Aspheric Console',
      htmlContent: '<p>Hello</p>',
      textContent: 'Hello',
      tags: ['welcome'],
    });
  });

  it('rejects when Brevo does not accept the email', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"code":"unauthorized"}', { status: 401 }),
        ),
    );

    await expect(new BrevoProvider(settings).send(message)).rejects.toThrow(
      'Brevo responded 401',
    );
  });

  it('refuses to send without a key and sender', async () => {
    const provider = new BrevoProvider({
      ...settings,
      brevoApiKey: undefined,
    });

    expect(provider.isConfigured).toBe(false);
    await expect(provider.send(message)).rejects.toThrow('not configured');
  });
});
