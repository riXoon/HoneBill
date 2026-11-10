import { describe, expect, it, jest } from '@jest/globals';
import { UnrecoverableError } from 'bullmq';
import { SettlementDrainService, type ManualWorker } from './settlement-drain.service.js';
import { SettlementQueueService } from './settlement-queue.service.js';

jest.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => void p }));

type FakeJob = {
  id: string;
  name: string;
  data: { smsBody: string };
  moveToCompleted: jest.Mock<(...a: any[]) => Promise<void>>;
  moveToFailed: jest.Mock<(...a: any[]) => Promise<void>>;
};

const job = (id: string): FakeJob => ({
  id,
  name: 'process-offline-voucher',
  data: { smsBody: `voucher-${id}` },
  moveToCompleted: jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined),
  moveToFailed: jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined),
});

function makeDrain(jobs: FakeJob[], processSettlement: (body: string) => Promise<any>) {
  const queue: FakeJob[] = [...jobs];
  const worker: ManualWorker & { close: jest.Mock<() => Promise<void>> } = {
    getNextJob: jest.fn(async () => queue.shift() as any) as any,
    close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const queueService = new SettlementQueueService({ add: jest.fn() } as any);
  class Drain extends SettlementDrainService {
    protected override async createWorker() {
      return worker;
    }
  }
  const drain = new Drain({} as any, queueService, { processSettlement } as any);
  return { drain, worker };
}

describe('SettlementDrainService', () => {
  it('settles every queued job, completes it with its token and closes the worker', async () => {
    const [a, b] = [job('a'), job('b')];
    const { drain, worker } = makeDrain([a, b], async () => ({ status: 'SETTLED', txHash: 'h'.repeat(64) }));
    await expect(drain.drain()).resolves.toEqual({ processed: 2, failed: 0 });
    expect(a.moveToCompleted).toHaveBeenCalledWith({ status: 'SETTLED', txHash: 'h'.repeat(64) }, expect.any(String), false);
    expect(b.moveToCompleted).toHaveBeenCalled();
    expect(worker.getNextJob).toHaveBeenCalledWith(expect.any(String), { block: false });
    expect(worker.close).toHaveBeenCalledTimes(1);
  });

  it('hands a failed job back to BullMQ so its attempts and backoff apply', async () => {
    const a = job('a');
    const { drain } = makeDrain([a], async () => {
      throw new Error('Settlement is not confirmed yet (timeout)');
    });
    await expect(drain.drain()).resolves.toEqual({ processed: 0, failed: 1 });
    expect(a.moveToFailed).toHaveBeenCalledWith(expect.any(Error), expect.any(String), false);
    expect(a.moveToCompleted).not.toHaveBeenCalled();
  });

  it('passes a job BullMQ should not retry as an UnrecoverableError and keeps draining', async () => {
    const [bad, good] = [job('bad'), job('good')];
    const { drain } = makeDrain([bad, good], async (body) => {
      if (body === 'voucher-bad') throw new UnrecoverableError('bad signature');
      return { status: 'SETTLED' };
    });
    await expect(drain.drain()).resolves.toEqual({ processed: 1, failed: 1 });
    expect(bad.moveToFailed.mock.calls[0][0]).toBeInstanceOf(UnrecoverableError);
    expect(good.moveToCompleted).toHaveBeenCalled();
  });

  it('does not start a job when too little of the time budget is left', async () => {
    const a = job('a');
    const { drain, worker } = makeDrain([a], async () => ({ status: 'SETTLED' }));
    await expect(drain.drain(1_000)).resolves.toEqual({ processed: 0, failed: 0 });
    expect(worker.getNextJob).not.toHaveBeenCalled();
    expect(worker.close).toHaveBeenCalled();
  });

  it('runs one drain at a time on an instance', async () => {
    const a = job('a');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { drain, worker } = makeDrain([a], async () => {
      await gate;
      return { status: 'SETTLED' };
    });
    const first = drain.drain();
    const second = drain.drain();
    release();
    await expect(first).resolves.toEqual({ processed: 1, failed: 0 });
    await expect(second).resolves.toEqual({ processed: 1, failed: 0 });
    expect(worker.close).toHaveBeenCalledTimes(1);
  });

  it('starts a drain whenever the producer queues a voucher', async () => {
    const queueService = new SettlementQueueService({} as any);
    const onEnqueued = jest.spyOn(queueService, 'onEnqueued');
    const drain = new SettlementDrainService({} as any, queueService, {} as any);
    const kick = jest.spyOn(drain, 'kick').mockImplementation(() => undefined);
    drain.onModuleInit();
    expect(onEnqueued).toHaveBeenCalledTimes(1);
    // What the producer calls after queueing a voucher starts the drain.
    (onEnqueued.mock.calls[0][0] as () => void)();
    expect(kick).toHaveBeenCalledTimes(1);
  });
});
