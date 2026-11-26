import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import type { DatabaseConfig } from '../config/configuration';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/** Single source of TypeORM options — shared by the Nest app and the migration CLI. */
export function buildDataSourceOptions(db: DatabaseConfig): DataSourceOptions {
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: db.name,
    ssl: db.ssl ? { rejectUnauthorized: false } : false,
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'migrations',
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    logging: db.logging ? ['query', 'error', 'warn'] : ['error'],
    extra: { max: db.poolSize },
  };
}
