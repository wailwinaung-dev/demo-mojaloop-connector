export interface OutboundTransferRequestDto {
  payerIdentifier: string;
  payerIdType?: string;
  payeeIdentifier: string;
  payeeIdType?: string;
  payeeFsp: string;
  amount: string;
  currency: string;
  ilpPacket: string;
  condition: string;
  expiration?: string;
}

export interface OutboundTransferResponse {
  transferId: string;
  transferState: 'COMMITTED';
  completedTimestamp: string;
  fulfillment: string;
  amount: string;
  currency: string;
  payerIdentifier: string;
  payeeIdentifier: string;
}
