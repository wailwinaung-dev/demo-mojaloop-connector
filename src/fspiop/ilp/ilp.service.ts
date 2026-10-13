import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Mojaloop FSPIOP Specification Regex for IlpCondition and IlpFulfillment.
 * 32 bytes encoded in Base64url without padding produces exactly 43 characters.
 */
export const ILP_CRYPTO_REGEX = /^[A-Za-z0-9_-]{43}$/;

export interface IlpCryptoPair {
  /**
   * The secret 32-byte preimage (Fulfillment), base64url encoded (43 chars).
   */
  fulfillment: string;

  /**
   * The SHA-256 hash of the preimage (Condition), base64url encoded (43 chars).
   */
  condition: string;
}

@Injectable()
export class IlpService {
  /**
   * Generates a cryptographically secure 32-byte secret (Fulfillment)
   * and derives its SHA-256 hash (Condition) conforming to Mojaloop spec.
   */
  public generatePreimageAndCondition(): IlpCryptoPair {
    // 1. Generate 32 cryptographically secure random bytes
    const preimageBuffer = crypto.randomBytes(32);
    const fulfillment = preimageBuffer.toString('base64url');

    // 2. Compute SHA-256 digest of the preimage
    const conditionBuffer = crypto
      .createHash('sha256')
      .update(preimageBuffer)
      .digest();
    const condition = conditionBuffer.toString('base64url');

    return {
      fulfillment,
      condition,
    };
  }

  /**
   * Derives the Condition (SHA-256 digest) from an existing Fulfillment string.
   */
  public calculateCondition(fulfillment: string): string {
    if (!this.isValidFormat(fulfillment)) {
      throw new BadRequestException(
        `Invalid fulfillment format: must match regex ${ILP_CRYPTO_REGEX.source}`,
      );
    }

    const preimageBuffer = Buffer.from(fulfillment, 'base64url');
    return crypto
      .createHash('sha256')
      .update(preimageBuffer)
      .digest('base64url');
  }

  /**
   * Verifies if a given fulfillment matches the expected condition.
   * Used by Payer DFSPs and the Switch during transfer commitment.
   */
  public verifyFulfillment(fulfillment: string, condition: string): boolean {
    if (!this.isValidFormat(fulfillment) || !this.isValidFormat(condition)) {
      return false;
    }

    const calculated = this.calculateCondition(fulfillment);
    // Use timingSafeEqual to protect against timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(calculated, 'utf8'),
      Buffer.from(condition, 'utf8'),
    );
  }

  /**
   * Validates whether a string conforms to the 43-character Base64url Mojaloop format.
   */
  public isValidFormat(value: string): boolean {
    return ILP_CRYPTO_REGEX.test(value);
  }
}
