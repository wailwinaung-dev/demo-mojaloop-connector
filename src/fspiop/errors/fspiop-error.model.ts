import {
  FSPIOP_ERROR_CODES,
  type FspiopErrorCode,
} from './fspiop-error-codes.js';

export interface FspiopExtension {
  key: string;
  value: string;
}

export interface FspiopErrorInformation {
  errorCode: string;
  errorDescription: string;
  extensionList?: {
    extension: FspiopExtension[];
  };
}

/**
 * Standard Mojaloop Error Payload sent on error callbacks (e.g. PUT /parties/{id}/error).
 */
export interface FspiopErrorPayload {
  errorInformation: FspiopErrorInformation;
}

/**
 * Factory helper to construct a spec-compliant FSPIOP error payload.
 */
export function createFspiopError(
  errorCode: FspiopErrorCode | string,
  errorDescription: string,
  cause?: string,
): FspiopErrorPayload {
  const payload: FspiopErrorPayload = {
    errorInformation: {
      errorCode,
      errorDescription,
    },
  };

  if (cause) {
    payload.errorInformation.extensionList = {
      extension: [{ key: 'cause', value: cause }],
    };
  }

  return payload;
}

/**
 * Convenient pre-built errors for common scenarios.
 */
export const FspiopErrors = {
  idNotFound: (identifier: string) =>
    createFspiopError(
      FSPIOP_ERROR_CODES.GENERIC_ID_NOT_FOUND,
      'Generic ID not found',
      `Identifier ${identifier} does not exist in CBS`,
    ),

  idNotActive: (identifier: string) =>
    createFspiopError(
      FSPIOP_ERROR_CODES.ID_NOT_ACTIVE,
      'ID not active',
      `Account for identifier ${identifier} is suspended or closed`,
    ),

  unsupportedCurrency: (requested: string, supported: string) =>
    createFspiopError(
      FSPIOP_ERROR_CODES.PAYEE_UNSUPPORTED_CURRENCY,
      'Payee FSP cannot handle the requested currency',
      `Requested currency ${requested} does not match account currency ${supported}`,
    ),

  genericTransferError: (message: string) =>
    createFspiopError(
      FSPIOP_ERROR_CODES.GENERIC_TRANSFER_ERROR,
      'Generic transfer error',
      message,
    ),

  genericQuoteError: (message: string) =>
    createFspiopError(
      FSPIOP_ERROR_CODES.GENERIC_QUOTE_ERROR,
      'Generic quote error',
      message,
    ),
};
