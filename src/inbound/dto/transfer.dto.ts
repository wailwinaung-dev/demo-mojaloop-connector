import type { Money } from './quote.dto.js';

export interface TransferExtension {
  key: string;
  value: string;
}

export interface TransferExtensionList {
  extension: TransferExtension[];
}

/**
 * Incoming POST /transfers Request Payload according to Mojaloop FSPIOP v1.1.
 */
export interface TransferRequestPayload {
  /** Unique ID of this transfer (UUID) */
  transferId: string;
  /** DFSP ID of the Payee (Receiver) */
  payeeFsp: string;
  /** DFSP ID of the Payer (Sender) */
  payerFsp: string;
  /** Transfer amount and currency */
  amount: Money;
  /** Base64url encoded ASN.1 OER ILP Prepare packet */
  ilpPacket: string;
  /** 43-character Base64url SHA-256 cryptographic condition */
  condition: string;
  /** RFC 3339 / ISO expiration timestamp */
  expiration: string;
  /** Optional transaction extension list */
  extensionList?: TransferExtensionList;
}

export type TransferState = 'COMMITTED' | 'RESERVED' | 'ABORTED';

export interface TransferResponsePayload {
  /** 43-character Base64url 32-byte secret fulfillment preimage (Mojaloop canonical is 'fulfilment') */
  fulfilment?: string;
  fulfillment?: string;
  /** ISO timestamp when the transfer completed */
  completedTimestamp?: string;
  /** Final state of the transfer (COMMITTED for successful Payee execution) */
  transferState: TransferState;
  /** Optional extension list */
  extensionList?: TransferExtensionList;
}
