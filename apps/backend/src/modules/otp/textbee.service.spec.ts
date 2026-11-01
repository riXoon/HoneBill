import { ConfigService } from '@nestjs/config';
import { TextbeeService } from './textbee.service';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

describe('TextbeeService', () => {
afterEach(() => {
  jest.useRealTimers();
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

  it('normalizes Philippine local numbers and uses the configured SIM slot', async () => {
    const config = new ConfigService({
      TEXTBEE_DEVICE_ID: 'primary-id',
      TEXTBEE_API_KEY: 'key',
      TEXTBEE_SIM_SUBSCRIPTION_ID: '2',
      TEXTBEE_RETRIES: 0,
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{"accepted":true}', { status: 200 }),
    );
    const result = await new TextbeeService(config).deliver('0917 123 4567', 'receipt');

    expect(result).toMatchObject({ success: true, gateway: 'primary', attempts: 1 });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.textbee.dev/api/v1/gateway/devices/primary-id/send-sms',
      expect.objectContaining({
        body: JSON.stringify({ recipients: ['+639171234567'], message: 'receipt', simSubscriptionId: 2 }),
      }),
    );
  });

  it('retries a transient gateway response once then succeeds', async () => {
    const config = new ConfigService({
      TEXTBEE_GATEWAY_URL: 'https://primary.example/send',
      TEXTBEE_API_KEY: 'key',
      TEXTBEE_RETRIES: 1,
    });
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

    const result = await new TextbeeService(config).deliver('+639000000001', 'hello');

    expect(result).toMatchObject({ success: true, attempts: 2 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('tries the fallback after a permanent primary failure and reports both failures', async () => {
    const config = new ConfigService({
      TEXTBEE_GATEWAY_URL: 'https://primary.example/send',
      TEXTBEE_API_KEY: 'primary-key',
      TEXTBEE_FALLBACK_DEVICE_ID: 'backup-id',
      TEXTBEE_FALLBACK_API_KEY: 'backup-key',
      TEXTBEE_RETRIES: 0,
    });
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('disabled', { status: 400 }))
      .mockResolvedValueOnce(new Response('disabled', { status: 400 }));

    const result = await new TextbeeService(config).deliver('+639000000001', 'hello');

    expect(result).toMatchObject({ success: false, attempts: 2, retryable: false });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      'https://api.textbee.dev/api/v1/gateway/devices/backup-id/send-sms',
    );
  });

  it('does not send malformed recipients and treats a malformed success body as an accepted send', async () => {
    const config = new ConfigService({
      TEXTBEE_GATEWAY_URL: 'https://primary.example/send',
      TEXTBEE_API_KEY: 'key',
      TEXTBEE_RETRIES: 0,
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('not-json', { status: 200 }),
    );
    const service = new TextbeeService(config);

    expect(await service.deliver('123', 'hello')).toMatchObject({ success: false, attempts: 0, retryable: false });
    expect(await service.deliver('+639000000001', 'hello')).toMatchObject({
      success: true,
      attempts: 1,
      data: null,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('reports network and timeout failures as retryable', async () => {
    const config = new ConfigService({
      TEXTBEE_GATEWAY_URL: 'https://primary.example/send',
      TEXTBEE_API_KEY: 'key',
      TEXTBEE_RETRIES: 0,
    });
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    await expect(new TextbeeService(config).deliver('+639000000001', 'hello')).resolves.toMatchObject({
      success: false,
      attempts: 1,
      retryable: true,
    });
  });

  // Ported from legacy sms-delivery.test.ts. Check retry classification through
  // the public sender rather than exposing its private status-code helper.
  it.each([408, 429, 500, 502, 503])('retries HTTP %i and succeeds on the next attempt', async (status) => {
    jest.useFakeTimers();
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('busy', { status }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const service = new TextbeeService(new ConfigService({ TEXTBEE_DEVICE_ID: 'primary', TEXTBEE_API_KEY: 'key' }));
    const result = service.deliver('09171234567', 'hi', { retries: 1 });
    await jest.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ success: true, attempts: 2 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404, 422])('does not retry permanent HTTP %i errors', async (status) => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('rejected', { status }));
    const service = new TextbeeService(new ConfigService({ TEXTBEE_DEVICE_ID: 'primary', TEXTBEE_API_KEY: 'key' }));
    await expect(service.deliver('+639171234567', 'hi', { retries: 2 })).resolves.toMatchObject({ success: false, attempts: 1, retryable: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries network errors before reporting a retryable failure', async () => {
    jest.useFakeTimers();
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const service = new TextbeeService(new ConfigService({ TEXTBEE_DEVICE_ID: 'primary', TEXTBEE_API_KEY: 'key' }));
    const result = service.deliver('+639171234567', 'hi', { retries: 1 });
    await jest.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ success: false, attempts: 2, retryable: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('stops retrying and skips fallback when the shared deadline is exhausted', async () => {
    jest.useFakeTimers();
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const service = new TextbeeService(new ConfigService({
      TEXTBEE_DEVICE_ID: 'primary', TEXTBEE_API_KEY: 'key', TEXTBEE_FALLBACK_DEVICE_ID: 'backup',
    }));
    const started = Date.now();
    const result = service.deliver('+639171234567', 'hi', { retries: 5, deadlineMs: 1500 });
    await jest.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ success: false, retryable: true });
    expect(Date.now() - started).toBeLessThanOrEqual(1500);
    expect(fetchSpy.mock.calls.every(([url]) => String(url).includes('/primary/'))).toBe(true);
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
    expect(fetchSpy.mock.calls.length).toBeLessThan(6);
  });

  it('derives device URLs and skips an identical fallback gateway', () => {
    const service = new TextbeeService(new ConfigService({ TEXTBEE_DEVICE_ID: 'abc', TEXTBEE_FALLBACK_DEVICE_ID: 'abc', TEXTBEE_API_KEY: 'key' }));
    expect(service.getGateways()).toEqual([{ name: 'primary', url: 'https://api.textbee.dev/api/v1/gateway/devices/abc/send-sms', apiKey: 'key', simSubscriptionId: undefined }]);
  });

  it('uses the fallback SIM and inherits the primary API key when needed', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('busy', { status: 500 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const service = new TextbeeService(new ConfigService({ TEXTBEE_DEVICE_ID: 'primary', TEXTBEE_API_KEY: 'key', TEXTBEE_FALLBACK_DEVICE_ID: 'backup', TEXTBEE_FALLBACK_SIM_SUBSCRIPTION_ID: '2' }));
    await expect(service.deliver('+639171234567', 'hi', { retries: 0 })).resolves.toMatchObject({ success: true, gateway: 'fallback', attempts: 2 });
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({ headers: expect.objectContaining({ 'x-api-key': 'key' }), body: JSON.stringify({ recipients: ['+639171234567'], message: 'hi', simSubscriptionId: 2 }) });
  });

  it.each(['0917 123 4567', '639171234567'])('normalizes the legacy PH recipient format %s', async (recipient) => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const service = new TextbeeService(new ConfigService({ TEXTBEE_DEVICE_ID: 'primary', TEXTBEE_API_KEY: 'key' }));
    await service.deliver(recipient, 'hi');
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)).recipients).toEqual(['+639171234567']);
  });

  it('reports missing configuration as permanent without contacting a gateway', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(new TextbeeService(new ConfigService({})).deliver('+639171234567', 'hi')).resolves.toMatchObject({ success: false, attempts: 0, retryable: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
