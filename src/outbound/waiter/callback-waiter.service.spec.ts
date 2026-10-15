import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallbackWaiterService } from './callback-waiter.service.js';
import { GatewayTimeoutException } from '@nestjs/common';

describe('CallbackWaiterService', () => {
  let waiterService: CallbackWaiterService;

  beforeEach(() => {
    vi.useFakeTimers();
    waiterService = new CallbackWaiterService();
  });

  it('should successfully resolve a waiting promise when matching key is resolved', async () => {
    const promise = waiterService.waitFor<{ name: string }>('party:MSISDN:0911111111', 5000);

    expect(waiterService.activeWaitersCount).toBe(1);

    const resolved = waiterService.resolve('party:MSISDN:0911111111', { name: 'Alice Smith' });
    expect(resolved).toBe(true);
    expect(waiterService.activeWaitersCount).toBe(0);

    const result = await promise;
    expect(result).toEqual({ name: 'Alice Smith' });
  });

  it('should reject with GatewayTimeoutException with structured 504 format when timeout elapses', async () => {
    const promise = waiterService.waitFor('party:MSISDN:0999999999', 3000);

    vi.advanceTimersByTime(3001);

    try {
      await promise;
      expect.fail('Should have thrown GatewayTimeoutException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(GatewayTimeoutException);
      const res = err.getResponse();
      expect(res.statusCode).toBe(504);
      expect(res.error).toBe('Gateway Timeout');
      expect(res.mojaloopErrorCode).toBe('1001');
      expect(res.message).toContain('party:MSISDN:0999999999');
    }

    expect(waiterService.activeWaitersCount).toBe(0);
  });

  it('should support register() and delayed wait() without arming timer prematurely', async () => {
    const handle = waiterService.register<{ status: string }>('quote:123');
    expect(waiterService.activeWaitersCount).toBe(1);

    // Fast forward 4000ms: timer should not have been armed yet
    vi.advanceTimersByTime(4000);
    expect(waiterService.activeWaitersCount).toBe(1);

    // Now arm wait with 3000ms
    const waitPromise = handle.wait(3000);

    // Fast forward another 2000ms (total 6000ms from register): still alive
    vi.advanceTimersByTime(2000);
    expect(waiterService.activeWaitersCount).toBe(1);

    // Resolve now
    waiterService.resolve('quote:123', { status: 'AGREED' });
    const result = await waitPromise;
    expect(result).toEqual({ status: 'AGREED' });
    expect(waiterService.activeWaitersCount).toBe(0);
  });

  it('should handle callback arriving before wait() is called', async () => {
    const handle = waiterService.register<{ status: string }>('quote:early');
    expect(waiterService.activeWaitersCount).toBe(1);

    // Callback arrives immediately (e.g. while HTTP dispatch was in flight)
    waiterService.resolve('quote:early', { status: 'EARLY_RESOLVE' });
    expect(waiterService.activeWaitersCount).toBe(0);

    // Caller now invokes wait()
    const result = await handle.wait(5000);
    expect(result).toEqual({ status: 'EARLY_RESOLVE' });
  });

  it('should cancel only the specified waiter without affecting others', () => {
    waiterService.register('key-1');
    waiterService.register('key-2');
    expect(waiterService.activeWaitersCount).toBe(2);

    const cancelled = waiterService.cancel('key-1');
    expect(cancelled).toBe(true);
    expect(waiterService.activeWaitersCount).toBe(1);

    // key-2 should still be resolvable
    expect(waiterService.resolve('key-2', 'ok')).toBe(true);
    expect(waiterService.activeWaitersCount).toBe(0);
  });

  it('should reject a waiting promise when reject is called with an error', async () => {
    const promise = waiterService.waitFor('party:MSISDN:0911111111', 5000);

    const error = new Error('ID not found');
    const rejected = waiterService.reject('party:MSISDN:0911111111', error);

    expect(rejected).toBe(true);
    await expect(promise).rejects.toThrow('ID not found');
    expect(waiterService.activeWaitersCount).toBe(0);
  });

  it('should return false when resolving, rejecting, or cancelling a non-existent key', () => {
    expect(waiterService.resolve('non-existent-key', {})).toBe(false);
    expect(waiterService.reject('non-existent-key', new Error())).toBe(false);
    expect(waiterService.cancel('non-existent-key')).toBe(false);
  });
});
