import { beforeEach, describe, expect, it } from 'vitest';
import { PreimageStoreService } from './preimage-store.service.js';

describe('PreimageStoreService', () => {
  let store: PreimageStoreService;

  beforeEach(() => {
    store = new PreimageStoreService();
  });

  it('should store and retrieve record by quoteId', () => {
    store.save('quote-1', 'fulfillment-abc', 'condition-xyz', 60);

    const record = store.getByQuoteId('quote-1');
    expect(record).toBeDefined();
    expect(record?.fulfillment).toBe('fulfillment-abc');
    expect(record?.condition).toBe('condition-xyz');
  });

  it('should retrieve record by condition', () => {
    store.save('quote-2', 'fulfillment-123', 'condition-456', 60);

    const record = store.getByCondition('condition-456');
    expect(record).toBeDefined();
    expect(record?.quoteId).toBe('quote-2');
  });

  it('should return null for expired records', () => {
    // Expiry in past (-1 second)
    store.save('quote-expired', 'f-exp', 'c-exp', -1);

    const record = store.getByQuoteId('quote-expired');
    expect(record).toBeNull();
  });

  it('should delete record upon request', () => {
    store.save('quote-3', 'f-3', 'c-3', 60);
    expect(store.delete('quote-3')).toBe(true);
    expect(store.getByQuoteId('quote-3')).toBeNull();
  });
});
