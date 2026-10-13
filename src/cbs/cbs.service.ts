import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Account, FundReservation } from './models/account.interface.js';

@Injectable()
export class CbsService {
  private accounts = new Map<string, Account>();
  private reservations = new Map<string, FundReservation>();

  constructor() {
    this.seedAccounts();
  }

  /**
   * Seed mock customer accounts for testing.
   */
  public seedAccounts(): void {
    this.accounts.clear();
    this.reservations.clear();

    const initialAccounts: Account[] = [
      {
        id: 'acc-alice',
        accountNumber: '10000001',
        msisdn: '0911111111',
        name: 'Alice Smith',
        currency: 'USD',
        balance: 1000.0,
        reservedBalance: 0.0,
        status: 'ACTIVE',
      },
      {
        id: 'acc-bob',
        accountNumber: '10000002',
        msisdn: '0922222222',
        name: 'Bob Jones',
        currency: 'USD',
        balance: 500.0,
        reservedBalance: 0.0,
        status: 'ACTIVE',
      },
    ];

    for (const acc of initialAccounts) {
      this.accounts.set(acc.id, { ...acc });
    }
  }

  /**
   * Find an account by identifier type (MSISDN or ACCOUNT_ID / ACCOUNT_NO).
   * Used during the Mojaloop Discovery phase (GET /parties/{Type}/{ID}).
   */
  public lookupByIdentifier(type: string, identifier: string): Account | null {
    const normalizedType = type.toUpperCase();
    for (const account of this.accounts.values()) {
      if (normalizedType === 'MSISDN' && account.msisdn === identifier) {
        return account;
      }
      if (
        (normalizedType === 'ACCOUNT_ID' || normalizedType === 'ACCOUNT_NO') &&
        (account.id === identifier || account.accountNumber === identifier)
      ) {
        return account;
      }
    }
    return null;
  }

  /**
   * Get an account directly by internal ID.
   */
  public getAccount(accountId: string): Account {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found in CBS`);
    }
    return account;
  }

  /**
   * Credit an account when an inbound Mojaloop transfer succeeds (Payee Flow).
   */
  public credit(accountId: string, amount: number, currency: string): Account {
    const account = this.getAccount(accountId);

    if (account.status !== 'ACTIVE') {
      throw new BadRequestException(`Account ${accountId} is not active`);
    }

    if (account.currency !== currency) {
      throw new BadRequestException(
        `Currency mismatch: account uses ${account.currency}, received ${currency}`,
      );
    }

    account.balance += amount;
    this.accounts.set(account.id, account);
    return { ...account };
  }

  /**
   * Hold/Reserve funds for an outbound transfer before committing (Payer Flow 2-Phase Commit).
   */
  public reserve(
    accountId: string,
    amount: number,
    currency: string,
    reservationId: string,
  ): FundReservation {
    const account = this.getAccount(accountId);

    if (account.status !== 'ACTIVE') {
      throw new BadRequestException(`Account ${accountId} is not active`);
    }

    if (account.currency !== currency) {
      throw new BadRequestException(
        `Currency mismatch: account uses ${account.currency}, requested ${currency}`,
      );
    }

    const availableBalance = account.balance - account.reservedBalance;
    if (availableBalance < amount) {
      throw new BadRequestException(
        `Insufficient funds in account ${accountId}. Available: ${availableBalance}, Required: ${amount}`,
      );
    }

    account.reservedBalance += amount;
    this.accounts.set(account.id, account);

    const reservation: FundReservation = {
      reservationId,
      accountId,
      amount,
      currency,
      createdAt: new Date(),
    };
    this.reservations.set(reservationId, reservation);

    return reservation;
  }

  /**
   * Finalize the reserved transfer: deduct permanently from balance and release hold.
   */
  public commit(reservationId: string): Account {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }

    const account = this.getAccount(reservation.accountId);
    account.balance -= reservation.amount;
    account.reservedBalance -= reservation.amount;
    this.accounts.set(account.id, account);

    this.reservations.delete(reservationId);
    return { ...account };
  }

  /**
   * Rollback a reserved transfer: release the hold and restore available balance.
   */
  public rollback(reservationId: string): Account {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }

    const account = this.getAccount(reservation.accountId);
    account.reservedBalance -= reservation.amount;
    this.accounts.set(account.id, account);

    this.reservations.delete(reservationId);
    return { ...account };
  }
}
