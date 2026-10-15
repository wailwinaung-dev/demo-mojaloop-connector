import {
  GatewayTimeoutException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { FSPIOP_ERROR_CODES } from '../../fspiop/errors/fspiop-error-codes.js';

export interface WaiterHandle<T = unknown> {
  key: string;
  wait: (timeoutMs?: number) => Promise<T>;
}

interface PendingCallback<T = unknown> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  timer?: NodeJS.Timeout;
  createdAt: number;
}

/**
 * Service to bridge Asynchronous Mojaloop Switch callbacks back to
 * Synchronous client-facing HTTP requests using in-memory correlated Promises.
 */
@Injectable()
export class CallbackWaiterService {
  private readonly logger = new Logger(CallbackWaiterService.name);
  private readonly waiters = new Map<string, PendingCallback<any>>();

  /**
   * Registers a correlation key in memory BEFORE dispatching to the Switch.
   * This guarantees any immediate asynchronous callback is not dropped,
   * while delaying the timeout countdown until the Switch accepts the dispatch.
   */
  public register<T>(key: string): WaiterHandle<T> {
    const existing = this.waiters.get(key);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    let resolveFn!: (value: T) => void;
    let rejectFn!: (reason?: unknown) => void;

    const promise = new Promise<T>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    // Safety net: attach silent rejection handler to prevent UnhandledPromiseRejection crash
    // if a timeout or reject occurs before the caller awaits this promise.
    promise.catch(() => {});

    const pending: PendingCallback<T> = {
      promise,
      resolve: resolveFn,
      reject: rejectFn,
      createdAt: Date.now(),
    };

    this.waiters.set(key, pending);
    this.logger.debug(`Registered callback waiter key: ${key}`);

    return {
      key,
      wait: (timeoutMs: number = 5000): Promise<T> => {
        this.armTimer(key, timeoutMs);
        return promise;
      },
    };
  }

  /**
   * Arms the timeout timer for an already-registered correlation key.
   */
  private armTimer(key: string, timeoutMs: number): void {
    const pending = this.waiters.get(key);
    if (!pending) {
      // Callback was already resolved or cancelled
      return;
    }

    if (pending.timer) {
      clearTimeout(pending.timer);
    }

    this.logger.debug(
      `Armed callback timeout timer for key: ${key} (${timeoutMs}ms)`,
    );

    pending.timer = setTimeout(() => {
      this.waiters.delete(key);
      this.logger.warn(`Callback waiter timed out for key: ${key}`);
      pending.reject(
        new GatewayTimeoutException({
          statusCode: HttpStatus.GATEWAY_TIMEOUT,
          error: 'Gateway Timeout',
          message: `Timeout waiting for Mojaloop callback for key: ${key}`,
          mojaloopErrorCode: FSPIOP_ERROR_CODES.DESTINATION_COMMUNICATION_ERROR,
        }),
      );
    }, timeoutMs);
  }

  /**
   * Registers a correlation key and immediately arms the timeout timer.
   * Provided for backward compatibility and single-step operations.
   */
  public waitFor<T>(key: string, timeoutMs: number = 5000): Promise<T> {
    const handle = this.register<T>(key);
    return handle.wait(timeoutMs);
  }

  /**
   * Resolves the waiting Promise associated with the given correlation key.
   */
  public resolve<T>(key: string, data: T): boolean {
    const pending = this.waiters.get(key);
    if (!pending) {
      this.logger.warn(`No active waiter found for resolve key: ${key}`);
      return false;
    }

    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    this.waiters.delete(key);
    this.logger.debug(`Successfully resolved callback waiter for key: ${key}`);
    pending.resolve(data);
    return true;
  }

  /**
   * Rejects the waiting Promise associated with the given correlation key (e.g. on error callback).
   */
  public reject(key: string, error: unknown): boolean {
    const pending = this.waiters.get(key);
    if (!pending) {
      this.logger.warn(`No active waiter found for reject key: ${key}`);
      return false;
    }

    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    this.waiters.delete(key);
    this.logger.debug(`Rejected callback waiter for key: ${key}`);
    pending.reject(error);
    return true;
  }

  /**
   * Cancels and removes a single active waiter by its key.
   * Useful when an outbound HTTP dispatch fails so its waiter is cleaned up without affecting other users.
   */
  public cancel(key: string): boolean {
    const pending = this.waiters.get(key);
    if (!pending) {
      return false;
    }

    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    this.waiters.delete(key);
    this.logger.debug(`Cancelled callback waiter for key: ${key}`);
    return true;
  }

  /**
   * Number of currently waiting requests.
   */
  public get activeWaitersCount(): number {
    return this.waiters.size;
  }

  /**
   * Clears all active waiters (useful for resets/shutdown).
   */
  public clear(): void {
    for (const pending of this.waiters.values()) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
    }
    this.waiters.clear();
  }
}

