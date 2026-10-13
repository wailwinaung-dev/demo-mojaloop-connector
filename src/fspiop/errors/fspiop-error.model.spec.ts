import { describe, expect, it } from 'vitest';
import { createFspiopError, FspiopErrors } from './fspiop-error.model.js';
import { FSPIOP_ERROR_CODES } from './fspiop-error-codes.js';

describe('FSPIOP Error Models', () => {
  it('should create a valid spec-compliant error payload without cause', () => {
    const error = createFspiopError(
      FSPIOP_ERROR_CODES.GENERIC_ID_NOT_FOUND,
      'Generic ID not found',
    );

    expect(error.errorInformation.errorCode).toBe('3200');
    expect(error.errorInformation.errorDescription).toBe(
      'Generic ID not found',
    );
    expect(error.errorInformation.extensionList).toBeUndefined();
  });

  it('should create an error with extensionList cause when cause is provided', () => {
    const error = createFspiopError(
      FSPIOP_ERROR_CODES.GENERIC_ID_NOT_FOUND,
      'Generic ID not found',
      'Account does not exist',
    );

    expect(error.errorInformation.errorCode).toBe('3200');
    expect(error.errorInformation.extensionList?.extension).toEqual([
      { key: 'cause', value: 'Account does not exist' },
    ]);
  });

  it('should create pre-built idNotFound error correctly', () => {
    const error = FspiopErrors.idNotFound('0999999999');

    expect(error.errorInformation.errorCode).toBe('3200');
    expect(error.errorInformation.errorDescription).toBe(
      'Generic ID not found',
    );
    expect(error.errorInformation.extensionList?.extension[0].value).toContain(
      '0999999999',
    );
  });

  it('should create pre-built unsupportedCurrency error correctly', () => {
    const error = FspiopErrors.unsupportedCurrency('EUR', 'USD');

    expect(error.errorInformation.errorCode).toBe('5202');
    expect(error.errorInformation.errorDescription).toContain('currency');
  });
});
