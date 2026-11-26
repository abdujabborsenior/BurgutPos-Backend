import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthRepository } from './repo/health.repository';

@Module({ controllers: [HealthController], providers: [HealthRepository] })
export class HealthModule {}
