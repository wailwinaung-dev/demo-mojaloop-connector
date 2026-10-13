export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export interface Account {
  id: string;
  accountNumber: string;
  msisdn: string;
  name: string;
  currency: string;
  balance: number;
  reservedBalance: number;
  status: AccountStatus;
}

export interface FundReservation {
  reservationId: string;
  accountId: string;
  amount: number;
  currency: string;
  createdAt: Date;
}
