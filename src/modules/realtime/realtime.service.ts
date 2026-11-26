import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { TransactionService } from '../../database/transaction/transaction.service';

/**
 * Cache scopes the frontend understands. A push tells every terminal which
 * data became stale; terminals refetch only what they currently display.
 */
export type RealtimeScope =
  | 'board'
  | 'orders'
  | 'counters'
  | 'stock'
  | 'menu'
  | 'shift'
  | 'settings'
  | 'halls'
  | 'payment-methods'
  | 'printers'
  | 'dashboard'
  | 'team';

@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  constructor(private readonly tx: TransactionService) {}

  attach(server: Server): void {
    this.server = server;
  }

  /** Broadcasts an invalidation once the current transaction has committed. */
  invalidate(
    scopes: RealtimeScope[],
    meta: Record<string, unknown> = {},
  ): void {
    this.tx.afterCommit(() => {
      this.server?.emit('invalidate', { scopes, ...meta });
    });
  }
}
