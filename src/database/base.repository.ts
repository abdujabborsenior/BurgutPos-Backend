import type {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { transactionStorage } from './transaction/transaction.context';

/**
 * Base class for every module repository (the only layer allowed to talk to
 * the database). It resolves the EntityManager of the ambient transaction,
 * falling back to the default connection outside of one.
 */
export abstract class BaseRepository<T extends ObjectLiteral> {
  protected constructor(
    protected readonly dataSource: DataSource,
    private readonly target: EntityTarget<T>,
  ) {}

  protected get manager(): EntityManager {
    return transactionStorage.getStore()?.manager ?? this.dataSource.manager;
  }

  protected get repo(): Repository<T> {
    return this.manager.getRepository(this.target);
  }

  /**
   * Raw SQL helper that respects the ambient transaction and always resolves
   * to the result rows. (TypeORM's postgres driver returns `[rows, rowCount]`
   * for UPDATE/DELETE statements — including `… RETURNING` — which is
   * normalised here so callers never misread it.)
   */
  protected async query<R = Record<string, unknown>>(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<R[]> {
    const result: unknown = await this.manager.query(sql, parameters);
    if (
      Array.isArray(result) &&
      result.length === 2 &&
      Array.isArray(result[0]) &&
      typeof result[1] === 'number'
    ) {
      return result[0] as R[];
    }
    return result as R[];
  }
}
