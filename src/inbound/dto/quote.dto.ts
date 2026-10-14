import type { PartyIdInfo, PartyPersonalInfo } from './party.dto.js';

export interface Money {
  currency: string;
  amount: string;
}

export interface QuoteParty {
  partyIdInfo: PartyIdInfo;
  name?: string;
  personalInfo?: PartyPersonalInfo;
}

export interface QuoteTransactionType {
  scenario: string;
  subScenario?: string;
  initiator: string;
  initiatorType: string;
  refundInfo?: unknown;
  balanceOfPayments?: string;
}

/**
 * Incoming POST /quotes Request Payload according to Mojaloop FSPIOP v1.1.
 */
export interface QuoteRequestPayload {
  quoteId: string;
  transactionId: string;
  transactionRequestId?: string;
  payee: QuoteParty;
  payer: QuoteParty;
  amountType: 'SEND' | 'RECEIVE';
  amount: Money;
  fees?: Money;
  transactionType: QuoteTransactionType;
  geoCode?: {
    latitude: string;
    longitude: string;
  };
  note?: string;
  expiration?: string;
}

/**
 * Outgoing PUT /quotes/{ID} Response Payload according to Mojaloop FSPIOP v1.1.
 */
export interface QuoteResponsePayload {
  transferAmount: Money;
  payeeReceiveAmount?: Money;
  payeeFspFee?: Money;
  payeeFspCommission?: Money;
  expiration: string;
  ilpPacket: string;
  condition: string;
  geoCode?: {
    latitude: string;
    longitude: string;
  };
}
