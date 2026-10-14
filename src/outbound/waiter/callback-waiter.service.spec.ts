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

  it('should reject with GatewayTimeoutException when timeout elapses', async () => {
    const promise = waiterService.waitFor('party:MSISDN:0999999999', 3000);

    // Fast forward past timeout
    vi.advanceTimersByTime(3001);

    await expect(promise).rejects.toThrow(GatewayTimeoutException);
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

  it('should return false when resolving or rejecting a non-existent key', () => {
    expect(waiterService.resolve('non-existent-key', {})).toBe(false);
    expect(waiterService.reject('non-existent-key', new Error())).toBe(false);
  });
});
