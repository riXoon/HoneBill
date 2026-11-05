import { ConfigService } from '@nestjs/config';
import { TextbeeService } from '../../../../src/modules/otp/textbee.service';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

describe('TextbeeService', () => {
afterEach(() => {
  jest.restoreAllMocks();
});
  it('sends the OTP to TextBee using its expected payload and API-key header', async () => {
    const config = new ConfigService({
      TEXTBEE_GATEWAY_URL: 'https://api.textbee.dev/send-sms',
      TEXTBEE_API_KEY: 'test-api-key',
      TEXTBEE_RETRIES: 0,
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const service = new TextbeeService(config);

    await service.send('+639000000001', 'Your code is 123456', {
      retries: 1,
      timeoutMs: 4000,
      deadlineMs: 8000,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.textbee.dev/send-sms',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
        body: JSON.stringify({ recipients: ['+639000000001'], message: 'Your code is 123456' }),
      }),
    );
  });

  it('uses the fallback gateway when the primary gateway fails', async () => {
    const config = new ConfigService({
      TEXTBEE_GATEWAY_URL: 'https://primary.example/send',
      TEXTBEE_API_KEY: 'primary-key',
      TEXTBEE_FALLBACK_GATEWAY_URL: 'https://fallback.example/send',
      TEXTBEE_FALLBACK_API_KEY: 'fallback-key',
      TEXTBEE_RETRIES: 0,
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const service = new TextbeeService(config);

    await service.send('+639000000001', 'Your code is 123456');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('https://fallback.example/send');
  });

  it('fails explicitly if TextBee is not configured', async () => {
    const service = new TextbeeService(new ConfigService({}));

    await expect(service.send('+639000000001', 'Your code is 123456')).rejects.toThrow(
      'TextBee SMS gateway is not configured.',
    );
  });
});
