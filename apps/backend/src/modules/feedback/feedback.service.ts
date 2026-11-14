import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FeedbackCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { FeedbackContextDto, FeedbackCategoryInput, SubmitFeedbackDto } from './dto/submit-feedback.dto.js';

const CATEGORY: Record<FeedbackCategoryInput, FeedbackCategory> = {
  payment: 'PAYMENT',
  account: 'ACCOUNT',
  bug: 'BUG',
  suggestion: 'SUGGESTION',
};

const LABEL: Record<FeedbackCategory, string> = {
  PAYMENT: 'Payment problem',
  ACCOUNT: 'Account or sign-in',
  BUG: "Something isn't working",
  SUGGESTION: 'Suggestion',
};

/** Shown before the topic in the Discord title, so the channel can be scanned at a glance. */
const ICON: Record<FeedbackCategory, string> = {
  PAYMENT: '💸',
  ACCOUNT: '🔐',
  BUG: '🐞',
  SUGGESTION: '💡',
};

const STATUS_ICON: Record<string, string> = { completed: '✅', pending: '⏳', failed: '❌' };

/** Discord embed colors (decimal RGB): orange for problems, coral for payments, green for suggestions. */
const COLOR: Record<FeedbackCategory, number> = {
  PAYMENT: 0xe6795e,
  ACCOUNT: 0xf08f31,
  BUG: 0xf08f31,
  SUGGESTION: 0x0ba98c,
};

/** Discord allows 4096 characters in an embed description and 1024 in a field value. */
const DESCRIPTION_MAX = 3500;
const FIELD_MAX = 1000;
const FORWARD_TIMEOUT_MS = 4000;
const WEBHOOK_PATTERN = /^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\/api\/webhooks\//;

/**
 * Stores reports from the app's Help & Feedback screen and forwards each one to the team's Discord channel
 * (`DISCORD_FEEDBACK_WEBHOOK_URL`). The database row is the record; Discord is a notification, so a Discord failure
 * never fails the report. One-way: nothing is sent back to the user.
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async submit(dto: SubmitFeedbackDto): Promise<{ success: true; id: number | null }> {
    const category = CATEGORY[dto.category];
    const context = cleanContext(dto.context);
    let created: { id: number; createdAt: Date };
    try {
      created = await this.prisma.feedback.create({
        data: {
          clientId: dto.clientId,
          category,
          message: dto.message.trim(),
          shortId: dto.shortId ?? null,
          ...(context ? { context: context as Prisma.InputJsonValue } : {}),
        },
        select: { id: true, createdAt: true },
      });
    } catch (error) {
      // The app retried a report that was already stored (its offline queue): nothing more to do.
      if (isUniqueConflict(error)) return { success: true, id: null };
      throw error;
    }

    // Awaited (with a short limit) rather than left running: on a serverless host work after the response is cut off.
    if (await this.forward(created.id, category, dto, context, created.createdAt)) {
      await this.prisma.feedback
        .update({ where: { id: created.id }, data: { forwardedAt: new Date() } })
        .catch(() => undefined);
    }
    return { success: true, id: created.id };
  }

  /** Posts the report to Discord. Returns whether it got there; logs and moves on when it did not. */
  private async forward(
    id: number,
    category: FeedbackCategory,
    dto: SubmitFeedbackDto,
    context: Record<string, string | number | boolean> | null,
    createdAt: Date,
  ): Promise<boolean> {
    const url = this.config.get<string>('DISCORD_FEEDBACK_WEBHOOK_URL')?.trim();
    if (!url) return false;
    if (!WEBHOOK_PATTERN.test(url)) {
      this.logger.warn('DISCORD_FEEDBACK_WEBHOOK_URL is not a Discord webhook URL; feedback was not forwarded.');
      return false;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordMessage(id, category, dto, context, createdAt)),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(`Feedback ${id} was stored but Discord answered ${response.status}.`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(`Feedback ${id} was stored but could not reach Discord: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Keeps only the context fields that are set. `null` when there are none. */
export function cleanContext(context?: FeedbackContextDto): Record<string, string | number | boolean> | null {
  if (!context) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The user's text with Discord formatting characters escaped, so it shows exactly as typed: it cannot break the
 * layout, hide text in spoilers, or turn into a masked link.
 */
export function escapeDiscord(text: string): string {
  return text.replace(/([\\`*_~|>#[\]()-])/g, '\\$1');
}

/** Inline code for values (IDs, refs): backticks inside would end the span, so they are swapped for a look-alike. */
function code(value: string): string {
  return `\`${value.replace(/`/g, 'ˋ')}\``;
}

/** Discord shows `<t:…:f>` in each reader's own time zone; `R` adds "3 hours ago". */
function discordTime(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const seconds = Math.floor(ms / 1000);
  return `<t:${seconds}:f> (<t:${seconds}:R>)`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The Discord webhook body: the topic and number as the title, the person's message as a highlighted quote block,
 * then who sent it, the device and (for payment reports) the transaction. Mentions are disabled, so a report can
 * never ping @everyone or a role.
 */
export function discordMessage(
  id: number,
  category: FeedbackCategory,
  dto: SubmitFeedbackDto,
  context: Record<string, string | number | boolean> | null,
  createdAt: Date,
) {
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: '👤 From', value: dto.shortId ? `Short ID ${code(dto.shortId)}` : 'Not signed in', inline: true },
  ];

  const device = [
    context?.platform ? titleCase(String(context.platform)) : null,
    context?.appVersion ? `v${context.appVersion}` : null,
  ].filter(Boolean);
  if (device.length > 0) fields.push({ name: '📱 Device', value: escapeDiscord(device.join(' · ')), inline: true });
  if (typeof context?.online === 'boolean') {
    fields.push({ name: '📶 Connection', value: context.online ? 'Online' : 'Offline when written', inline: true });
  }

  if (context?.transactionRef) {
    const amount =
      typeof context.transactionAmount === 'number'
        ? `${context.transactionAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${
            context.transactionAsset === 'PHPC' ? 'PHP' : (context.transactionAsset ?? '')
          }`.trim()
        : 'Unknown';
    const status = String(context.transactionStatus ?? 'unknown');
    const when = context.transactionTime ? discordTime(String(context.transactionTime)) : null;
    const lines = [
      `**Ref** ${code(String(context.transactionRef))}  ·  **Amount** ${escapeDiscord(amount)}`,
      `**Status** ${STATUS_ICON[status] ?? '•'} ${escapeDiscord(titleCase(status))}${
        context.transactionSource ? ` (${escapeDiscord(String(context.transactionSource))})` : ''
      }`,
      ...(context.failureReason ? [`**Reason** ${escapeDiscord(String(context.failureReason))}`] : []),
      ...(when ? [`**When** ${when}`] : []),
      ...(context.transactionNonce ? [`**Nonce** ${code(String(context.transactionNonce))}`] : []),
    ];
    fields.push({ name: '🧾 Transaction', value: clip(lines.join('\n'), FIELD_MAX) });
  }

  // The message is the point of the report: a heading, then the text as a quote block (the colored bar sets it apart).
  // Clipped after escaping: escapes add characters, and Discord rejects a description over 4096.
  const quoted = clip(escapeDiscord(dto.message.trim()), DESCRIPTION_MAX);
  return {
    username: 'HoneBill Feedback',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        author: { name: 'HoneBill · Help & Feedback' },
        title: clip(`${ICON[category]}  ${LABEL[category]}  ·  #${id}`, 250),
        description: `**💬 Message**\n>>> ${quoted}`,
        color: COLOR[category],
        fields,
        footer: { text: 'One-way report: the user does not see replies in the app.' },
        timestamp: createdAt.toISOString(),
      },
    ],
  };
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002';
}
