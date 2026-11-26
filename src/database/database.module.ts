import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DatabaseConfig } from '../config/configuration';
import { TransactionService } from './transaction/transaction.service';
import { buildDataSourceOptions } from './typeorm.options';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.getOrThrow<DatabaseConfig>('db');
        return {
          ...buildDataSourceOptions(db),
          migrationsRun: db.migrationsRun,
          retryAttempts: 5,
          retryDelay: 2000,
        };
      },
    }),
  ],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class DatabaseModule {}
