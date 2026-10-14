import {
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';

interface PendingCallback<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
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
   * Registers a correlation key and returns a Promise that will resolve
   * when the matching callback arrives, or reject upon timeout.
   */
  public waitFor<T>(key: string, timeoutMs: number = 5000): Promise<T> {
    this.logger.debug(`Registering callback waiter for key: ${key} (Timeout: ${timeoutMs}ms)`);

    return new Promise<T>((resolve, reject) => {
      // If an existing waiter exists with the same key, clean up its timer
      const existing = this.waiters.get(key);
      if (existing) {
        clearTimeout(existing.timer);
      }

      const timer = setTimeout(() => {
        this.waiters.delete(key);
        this.logger.warn(`Callback waiter timed out for key: ${key}`);
        reject(
          new GatewayTimeoutException(
            `Timeout waiting for Mojaloop callback for key: ${key}`,
          ),
        );
      }, timeoutMs);

      this.waiters.set(key, {
        resolve,
        reject,
        timer,
        createdAt: Date.now(),
      });
    });
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

    clearTimeout(pending.timer);
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

    clearTimeout(pending.timer);
    this.waiters.delete(key);
    this.logger.debug(`Rejected callback waiter for key: ${key}`);
    pending.reject(error);
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
      clearTimeout(pending.timer);
    }
    this.waiters.clear();
  }
}
