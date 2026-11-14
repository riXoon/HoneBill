import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { FeedbackService, cleanContext, discordMessage, escapeDiscord } from './feedback.service';
import type { SubmitFeedbackDto } from './dto/submit-feedback.dto';

const WEBHOOK = 'https://discord.com/api/webhooks/123/abc';

function makeService(options: { webhook?: string; duplicate?: boolean } = {}) {
  const prisma = {
    feedback: {
      create: jest.fn(async (..._args: any[]) => {
        if (options.duplicate) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        return { id: 7, createdAt: new Date('2026-11-14T08:00:00Z') };
      }),
      update: jest.fn(async (..._args: any[]) => ({})),
    },
  };
  const config = { get: jest.fn((key: string) => (key === 'DISCORD_FEEDBACK_WEBHOOK_URL' ? options.webhook : undefined)) };
  const service = new FeedbackService(prisma as unknown as PrismaService, config as unknown as ConfigService);
  return { service, prisma };
}

const report = (overrides: Partial<SubmitFeedbackDto> = {}): SubmitFeedbackDto => ({
  clientId: '2f1c8e8a-6d3b-4c7e-9a43-1b2c3d4e5f60',
  category: 'payment',
  message: '  I sent 500 yesterday and it has not arrived. @everyone  ',
  shortId: 'abc123',
  context: { appVersion: '1.0.0', platform: 'android', online: false, transactionRef: 'QUJDRE', transactionAmount: 500, transactionAsset: 'PHPC', transactionStatus: 'failed' },
  ...overrides,
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FeedbackService', () => {
  it('stores the report and forwards it to Discord with mentions disabled', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const { service, prisma } = makeService({ webhook: WEBHOOK });

    await expect(service.submit(report())).resolves.toEqual({ success: true, id: 7 });

    expect(prisma.feedback.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: 'PAYMENT',
          message: 'I sent 500 yesterday and it has not arrived. @everyone',
          shortId: 'abc123',
        }),
      }),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    const body = JSON.parse(String(init.body));
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.embeds[0].title).toBe('💸  Payment problem  ·  #7');
    expect(prisma.feedback.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { forwardedAt: expect.any(Date) } });
  });

  it('keeps the report when Discord is down', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const { service, prisma } = makeService({ webhook: WEBHOOK });
    await expect(service.submit(report())).resolves.toEqual({ success: true, id: 7 });
    expect(prisma.feedback.update).not.toHaveBeenCalled();
  });

  it('only stores the report when no webhook is set, or the URL is not a Discord webhook', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    await makeService().service.submit(report());
    await makeService({ webhook: 'https://example.com/hook' }).service.submit(report());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a retried report (same clientId) as already received, without posting it again', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const { service } = makeService({ webhook: WEBHOOK, duplicate: true });
    await expect(service.submit(report())).resolves.toEqual({ success: true, id: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('feedback helpers', () => {
  it('drops empty context fields', () => {
    expect(cleanContext({ appVersion: ' ', platform: 'ios', online: true })).toEqual({ platform: 'ios', online: true });
    expect(cleanContext({})).toBeNull();
    expect(cleanContext(undefined)).toBeNull();
  });

  it('highlights the message as a quote block and lists the transaction and device', () => {
    const context = cleanContext({
      ...report().context,
      transactionTime: '2026-11-13T08:00:00.000Z',
      failureReason: 'No account has this ID.',
    });
    const embed = discordMessage(9, 'PAYMENT', report(), context, new Date('2026-11-14T08:00:00Z')).embeds[0];
    expect(embed.description).toBe('**💬 Message**\n>>> I sent 500 yesterday and it has not arrived. @everyone');
    const transaction = embed.fields.find((f) => f.name === '🧾 Transaction')?.value ?? '';
    expect(transaction).toContain('**Ref** `QUJDRE`');
    expect(transaction).toContain('**Amount** 500.00 PHP');
    expect(transaction).toContain('**Status** ❌ Failed');
    expect(transaction).toContain('**When** <t:1794556800:f>');
    expect(embed.fields.find((f) => f.name === '📱 Device')?.value).toBe('Android · v1.0.0');
    expect(embed.fields.find((f) => f.name === '📶 Connection')?.value).toBe('Offline when written');
    expect(embed.fields.find((f) => f.name === '👤 From')?.value).toBe('Short ID `abc123`');
  });

  it('escapes Discord formatting in the message and keeps it under the limit', () => {
    expect(escapeDiscord('**bold** [link](http://x.y) ||spoiler|| `code`')).toBe(
      '\\*\\*bold\\*\\* \\[link\\]\\(http://x.y\\) \\|\\|spoiler\\|\\| \\`code\\`',
    );
    const long = discordMessage(1, 'BUG', report({ message: '*'.repeat(5000) }), null, new Date()).embeds[0];
    expect(long.description.length).toBeLessThanOrEqual(4096);
  });
});
