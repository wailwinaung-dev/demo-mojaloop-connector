/**
 * Complete set of standard FSPIOP Error Codes defined in Section 7 of the Mojaloop FSPIOP API Specification.
 *
 * Codes are categorized into 4-digit numeric ranges:
 * - 1xxx: Communication errors
 * - 2xxx: Server & Switch service errors
 * - 3xxx: Data validation, identifier & quote errors
 * - 4xxx: Security, integrity & fraud errors
 * - 5xxx: Transfer, liquidity & ledger execution errors
 */
export const FSPIOP_ERROR_CODES = {
  // ==========================================
  // 1xxx - Communication Errors
  // ==========================================
  /** Generic communication error across the network */
  GENERIC_COMMUNICATION_ERROR: '1000',
  /** The destination participant could not be reached */
  DESTINATION_COMMUNICATION_ERROR: '1001',

  // ==========================================
  // 2xxx - Server / System Errors
  // ==========================================
  /** Generic server error */
  GENERIC_SERVER_ERROR: '2000',
  /** The requested service or switch node is unavailable */
  GENERIC_SERVICE_UNAVAILABLE: '2001',
  /** An internal server error occurred within the participant system */
  INTERNAL_SERVER_ERROR: '2002',
  /** The requested feature or service is disabled */
  SERVICE_DISABLED: '2003',

  // ==========================================
  // 3xxx - Data, Syntax & Validation Errors
  // ==========================================
  /** Generic validation error */
  GENERIC_VALIDATION_ERROR: '3000',
  /** Payload format error */
  FORMAT_ERROR: '3001',
  /** Missing mandatory element in the request body */
  MISSING_MANDATORY_ELEMENT: '3002',
  /** Too many elements or unexpected fields in payload */
  TOO_MANY_ELEMENTS: '3003',
  /** The JSON payload syntax is malformed */
  MALFORMED_SYNTAX: '3101',
  /** Missing element according to schema */
  MISSING_ELEMENT: '3102',
  /** The requested endpoint URI does not exist */
  UNKNOWN_URI: '3104',
  /** HTTP method is not allowed on this resource */
  METHOD_NOT_ALLOWED: '3105',
  /** The Accept header value is not acceptable */
  NOT_ACCEPTABLE: '3106',
  /** Content-Type header is unsupported */
  UNSUPPORTED_MEDIA_TYPE: '3107',

  // ==========================================
  // 32xx - Party & Identifier Errors (Discovery Phase)
  // ==========================================
  /** Party identifier (phone number, account) was not found */
  GENERIC_ID_NOT_FOUND: '3200',
  /** Destination FSP not found in Account Lookup Service */
  DESTINATION_FSP_NOT_FOUND: '3201',
  /** Customer ID is inactive or suspended */
  ID_NOT_ACTIVE: '3202',
  /** Customer ID is blocked */
  ID_BLOCKED: '3203',
  /** Identifier format is invalid for the specified type */
  INVALID_IDENTIFIER: '3204',

  // ==========================================
  // 33xx - Quoting Errors (Agreement Phase)
  // ==========================================
  /** Generic quoting error */
  GENERIC_QUOTE_ERROR: '3300',
  /** The quote expiration timestamp has elapsed */
  QUOTE_EXPIRED: '3301',
  /** The specified quote ID was not found */
  QUOTE_NOT_FOUND: '3302',
  /** The quote status does not permit this action */
  INVALID_QUOTE_STATUS: '3303',

  // ==========================================
  // 4xxx - Security, Integrity & Fraud Errors
  // ==========================================
  /** Generic security error */
  GENERIC_SECURITY_ERROR: '4000',
  /** JWS digital signature is missing, invalid, or tampered */
  INVALID_SIGNATURE: '4001',
  /** Invalid credentials or TLS client certificate */
  INVALID_CREDENTIALS: '4002',
  /** Transaction flagged by fraud monitoring */
  GENERIC_FINANCIAL_FRAUD_ERROR: '4100',
  /** Transaction exceeds maximum allowed limit */
  TRANSACTION_LIMIT_EXCEEDED: '4101',

  // ==========================================
  // 5xxx - Transfer Execution Errors (Execution Phase)
  // ==========================================
  /** Generic transfer execution error */
  GENERIC_TRANSFER_ERROR: '5000',

  // 51xx - Payer-side errors
  /** Generic error on the payer side */
  GENERIC_PAYER_ERROR: '5100',
  /** Payer DFSP lacks sufficient liquidity in the settlement account */
  PAYER_FSP_INSUFFICIENT_LIQUIDITY: '5101',
  /** End customer account has insufficient balance */
  PAYER_INSUFFICIENT_FUNDS: '5102',
  /** Payer DFSP rejected the transfer */
  PAYER_FSP_REJECTED: '5103',

  // 52xx - Payee-side errors
  /** Generic error on the payee side */
  GENERIC_PAYEE_ERROR: '5200',
  /** Payee DFSP rejected the terms of the quote */
  PAYEE_FSP_REJECTED_QUOTE: '5201',
  /** Payee DFSP cannot handle the requested currency */
  PAYEE_UNSUPPORTED_CURRENCY: '5202',
  /** Payee account limit would be exceeded by this transfer */
  PAYEE_LIMIT_EXCEEDED: '5203',
  /** Payee DFSP rejected the transfer */
  PAYEE_FSP_REJECTED: '5204',
  /** Payee DFSP lacks sufficient liquidity */
  PAYEE_FSP_INSUFFICIENT_LIQUIDITY: '5205',
} as const;

export type FspiopErrorCode =
  (typeof FSPIOP_ERROR_CODES)[keyof typeof FSPIOP_ERROR_CODES];
