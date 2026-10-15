export interface OutboundQuoteRequestDto {
  payerIdentifier: string;
  payerIdType?: string;
  payeeIdentifier: string;
  payeeIdType?: string;
  payeeFsp: string;
  amount: string;
  currency: string;
  amountType?: 'SEND' | 'RECEIVE';
}
