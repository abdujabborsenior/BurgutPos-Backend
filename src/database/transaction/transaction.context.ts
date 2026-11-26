import { AsyncLocalStorage } from 'node:async_hooks';
import type { EntityManager } from 'typeorm';

export type AfterCommitHook = () => void | Promise<void>;

export interface TransactionContext {
  manager: EntityManager;
  afterCommitHooks: AfterCommitHook[];
}

/**
 * Ambient transaction context. Services open a transaction through
 * TransactionService; repositories transparently pick up the transactional
 * EntityManager from here, so business code never touches the database API.
 */
export const transactionStorage = new AsyncLocalStorage<TransactionContext>();
