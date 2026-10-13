import { describe, beforeEach, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CbsService } from './cbs.service.js';

describe('CbsService (Mock Core Banking System)', () => {
  let cbsService: CbsService;

  beforeEach(() => {
    cbsService = new CbsService();
  });

  describe('lookupByIdentifier', () => {
    it('should find account by MSISDN', () => {
      const account = cbsService.lookupByIdentifier('MSISDN', '0911111111');
      expect(account).toBeDefined();
      expect(account?.name).toBe('Alice Smith');
      expect(account?.balance).toBe(1000.0);
    });

    it('should find account by ACCOUNT_ID', () => {
      const account = cbsService.lookupByIdentifier('ACCOUNT_ID', 'acc-bob');
      expect(account).toBeDefined();
      expect(account?.name).toBe('Bob Jones');
      expect(account?.balance).toBe(500.0);
    });

    it('should return null for non-existent identifier', () => {
      const account = cbsService.lookupByIdentifier('MSISDN', '0999999999');
      expect(account).toBeNull();
    });
  });

  describe('credit', () => {
    it('should credit recipient account balance', () => {
      const updated = cbsService.credit('acc-alice', 200, 'USD');
      expect(updated.balance).toBe(1200.0);
    });

    it('should throw when currency does not match', () => {
      expect(() => cbsService.credit('acc-alice', 200, 'EUR')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('reserve, commit, and rollback (2-Phase Commit)', () => {
    it('should hold funds during reserve and permanently deduct on commit', () => {
      // 1. Reserve $100
      const res = cbsService.reserve('acc-alice', 100, 'USD', 'res-1');
      expect(res.amount).toBe(100);

      const accAfterHold = cbsService.getAccount('acc-alice');
      expect(accAfterHold.balance).toBe(1000);
      expect(accAfterHold.reservedBalance).toBe(100);

      // 2. Commit transfer
      const finalized = cbsService.commit('res-1');
      expect(finalized.balance).toBe(900);
      expect(finalized.reservedBalance).toBe(0);
    });

    it('should restore available balance on rollback', () => {
      cbsService.reserve('acc-alice', 150, 'USD', 'res-2');
      const rolledBack = cbsService.rollback('res-2');
      expect(rolledBack.balance).toBe(1000);
      expect(rolledBack.reservedBalance).toBe(0);
    });

    it('should reject reservation when funds are insufficient', () => {
      expect(() =>
        cbsService.reserve('acc-bob', 600, 'USD', 'res-overdraft'),
      ).toThrow(BadRequestException);
    });
  });
});
