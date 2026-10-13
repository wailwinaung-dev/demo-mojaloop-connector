import { describe, expect, it } from 'vitest';
import { IlpService, ILP_CRYPTO_REGEX } from './ilp.service.js';

describe('IlpService', () => {
  const ilpService = new IlpService();

  describe('generatePreimageAndCondition', () => {
    it('should generate fulfillment and condition matching 43-character base64url regex', () => {
      const pair = ilpService.generatePreimageAndCondition();

      expect(pair.fulfillment).toBeDefined();
      expect(pair.condition).toBeDefined();

      // Check length: 43 characters
      expect(pair.fulfillment.length).toBe(43);
      expect(pair.condition.length).toBe(43);

      // Check regex compliance
      expect(ILP_CRYPTO_REGEX.test(pair.fulfillment)).toBe(true);
      expect(ILP_CRYPTO_REGEX.test(pair.condition)).toBe(true);
    });

    it('should produce distinct random pairs on each invocation', () => {
      const pair1 = ilpService.generatePreimageAndCondition();
      const pair2 = ilpService.generatePreimageAndCondition();

      expect(pair1.fulfillment).not.toBe(pair2.fulfillment);
      expect(pair1.condition).not.toBe(pair2.condition);
    });
  });

  describe('calculateCondition', () => {
    it('should calculate identical condition given the same fulfillment', () => {
      const pair = ilpService.generatePreimageAndCondition();
      const recalculated = ilpService.calculateCondition(pair.fulfillment);

      expect(recalculated).toBe(pair.condition);
    });

    it('should reject invalid fulfillment format', () => {
      expect(() => ilpService.calculateCondition('short-secret')).toThrow(
        /Invalid fulfillment format/,
      );
    });
  });

  describe('verifyFulfillment', () => {
    it('should return true when fulfillment matches condition', () => {
      const pair = ilpService.generatePreimageAndCondition();
      const isValid = ilpService.verifyFulfillment(
        pair.fulfillment,
        pair.condition,
      );

      expect(isValid).toBe(true);
    });

    it('should return false when fulfillment does not match condition', () => {
      const pair1 = ilpService.generatePreimageAndCondition();
      const pair2 = ilpService.generatePreimageAndCondition();

      const isValid = ilpService.verifyFulfillment(
        pair1.fulfillment,
        pair2.condition,
      );
      expect(isValid).toBe(false);
    });

    it('should return false for malformed inputs', () => {
      expect(ilpService.verifyFulfillment('invalid', 'invalid')).toBe(false);
    });
  });
});
