import { Injectable, Logger } from '@nestjs/common';

export interface StoredCryptoRecord {
  /**
   * The unique Quote ID or transaction reference.
   */
  quoteId: string;

  /**
   * The 43-character base64url secret preimage (Fulfillment).
   */
  fulfillment: string;

  /**
   * The 43-character base64url SHA-256 digest (Condition).
   */
  condition: string;

  /**
   * Timestamp after which this record is considered expired.
   */
  expiresAt: Date;
}

@Injectable()
export class PreimageStoreService {
  private readonly logger = new Logger(PreimageStoreService.name);
  private readonly records = new Map<string, StoredCryptoRecord>();

  /**
   * Save a generated fulfillment/condition pair indexed by quoteId.
   */
  public save(
    quoteId: string,
    fulfillment: string,
    condition: string,
    expirySeconds: number = 60,
  ): StoredCryptoRecord {
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);
    const record: StoredCryptoRecord = {
      quoteId,
      fulfillment,
      condition,
      expiresAt,
    };

    this.records.set(quoteId, record);
    this.logger.debug(
      `Stored preimage for quote ${quoteId} (Expires in ${expirySeconds}s)`,
    );
    return record;
  }

  /**
   * Retrieve a stored record by Quote ID.
   */
  public getByQuoteId(quoteId: string): StoredCryptoRecord | null {
    const record = this.records.get(quoteId);
    if (!record) {
      return null;
    }

    if (new Date() > record.expiresAt) {
      this.logger.warn(`Preimage record for quote ${quoteId} has expired`);
      this.records.delete(quoteId);
      return null;
    }

    return record;
  }

  /**
   * Retrieve a stored record by Condition hash.
   * Useful when an incoming POST /transfers has the condition but quotes were referenced indirectly.
   */
  public getByCondition(condition: string): StoredCryptoRecord | null {
    for (const record of this.records.values()) {
      if (record.condition === condition) {
        if (new Date() > record.expiresAt) {
          this.records.delete(record.quoteId);
          return null;
        }
        return record;
      }
    }
    return null;
  }

  /**
   * Remove a stored record once the transfer is finalized.
   */
  public delete(quoteId: string): boolean {
    return this.records.delete(quoteId);
  }

  /**
   * Clear all records (useful for test resets).
   */
  public clear(): void {
    this.records.clear();
  }
}
