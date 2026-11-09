import { Injectable } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';

export type SmsDeviceStatus = {
  role: 'primary' | 'fallback';
  deviceId: string | null;
  status: 'online' | 'offline' | 'disabled' | 'unknown' | 'unconfigured';
  lastHeartbeat?: string;
  detail?: string;
};

const CACHE_KEY = 'honebill:health:textbee';
const CACHE_TTL_SECONDS = 30;
const STALE_HEARTBEAT_MS = 10 * 60 * 1000;

/** Classifies TextBee gateway heartbeats and caches deep probes to avoid excess API calls. */
@Injectable()
export class SmsHealthService {
  constructor(private readonly redisService: RedisService) {}

  /** Maps a TextBee device record and heartbeat age to the health response's status values. */
  classifyDevice(device: Record<string, unknown> | undefined, now = Date.now()): Pick<SmsDeviceStatus, 'status' | 'lastHeartbeat' | 'detail'> {
    if (!device) return { status: 'unknown', detail: 'Device not found in TextBee account' };
    if (device.enabled === false) return { status: 'disabled', lastHeartbeat: this.heartbeat(device) };
    const lastHeartbeat = this.heartbeat(device);
    if (!lastHeartbeat) return { status: 'unknown', detail: 'No heartbeat reported' };
    const age = now - Date.parse(lastHeartbeat);
    if (Number.isNaN(age)) return { status: 'unknown', lastHeartbeat };
    return { status: age <= STALE_HEARTBEAT_MS ? 'online' : 'offline', lastHeartbeat };
  }

  /** Loads primary and backup device health, using Redis cache entries when available. */
  async getStatuses(): Promise<SmsDeviceStatus[]> {
    const redis = this.redisService.getClient();
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached) as SmsDeviceStatus[];
    } catch { /* Cache is best effort. */ }

    const targets = [
      { role: 'primary' as const, deviceId: process.env.TEXTBEE_DEVICE_ID?.trim(), apiKey: process.env.TEXTBEE_API_KEY },
      { role: 'fallback' as const, deviceId: process.env.TEXTBEE_FALLBACK_DEVICE_ID?.trim(), apiKey: process.env.TEXTBEE_FALLBACK_API_KEY || process.env.TEXTBEE_API_KEY },
    ];
    const deviceLists = new Map<string, Promise<Record<string, unknown>[]>>();
    const statuses = await Promise.all(targets.map(async ({ role, deviceId, apiKey }): Promise<SmsDeviceStatus> => {
      if (!deviceId || !apiKey) return { role, deviceId: deviceId ?? null, status: 'unconfigured' };
      try {
        let devices = deviceLists.get(apiKey);
        if (!devices) {
          devices = this.fetchDevices(apiKey);
          deviceLists.set(apiKey, devices);
        }
        const list = await devices;
        const device = list.find((item) => item._id === deviceId || item.id === deviceId);
        return { role, deviceId, ...this.classifyDevice(device) };
      } catch (error) {
        return { role, deviceId, status: 'unknown', detail: error instanceof Error ? error.message : String(error) };
      }
    }));
    try { await redis.set(CACHE_KEY, JSON.stringify(statuses), 'EX', CACHE_TTL_SECONDS); } catch { /* Cache is best effort. */ }
    return statuses;
  }

  /** Fetches the TextBee device list with a short timeout so deep health checks remain bounded. */
  private async fetchDevices(apiKey: string): Promise<Record<string, unknown>[]> {
    const response = await fetch('https://api.textbee.dev/api/v1/gateway/devices', {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { data?: unknown };
    return Array.isArray(data.data) ? data.data as Record<string, unknown>[] : [];
  }

  /** Extracts the gateway's supported heartbeat field from a device record. */
  private heartbeat(device: Record<string, unknown>): string | undefined {
    const value = device.lastHeartbeat ?? device.updatedAt;
    return typeof value === 'string' ? value : undefined;
  }
}
