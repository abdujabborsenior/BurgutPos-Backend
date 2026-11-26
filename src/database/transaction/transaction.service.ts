import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type AfterCommitHook,
  transactionStorage,
} from './transaction.context';

export type IsolationLevel =
  'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Executes `work` inside a database transaction. A nested call joins the
   * already running transaction, so services can compose each other freely.
   */
  async run<T>(
    work: () => Promise<T>,
    isolationLevel: IsolationLevel = 'READ COMMITTED',
  ): Promise<T> {
    if (transactionStorage.getStore()) return work();

    const hooks: AfterCommitHook[] = [];
    const result = await this.dataSource.transaction(
      isolationLevel,
      (manager) =>
        transactionStorage.run({ manager, afterCommitHooks: hooks }, work),
    );
    for (const hook of hooks) await this.safeRun(hook);
    return result;
  }

  /** True when called inside an active transaction. */
  get inTransaction(): boolean {
    return transactionStorage.getStore() !== undefined;
  }

  /**
   * Defers a side effect (realtime push, file cleanup, …) until the current
   * transaction commits. Outside a transaction it runs immediately.
   * Hooks are dropped when the transaction rolls back.
   */
  afterCommit(hook: AfterCommitHook): void {
    const context = transactionStorage.getStore();
    if (context) context.afterCommitHooks.push(hook);
    else void this.safeRun(hook);
  }

  private async safeRun(hook: AfterCommitHook): Promise<void> {
    try {
      await hook();
    } catch (error) {
      this.logger.error('After-commit hook failed', error as Error);
    }
  }
}
