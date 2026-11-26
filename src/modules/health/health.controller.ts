import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { HealthRepository } from './repo/health.repository';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthRepository) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.health.ping();
    } catch {
      throw new ServiceUnavailableException('База данных недоступна');
    }
    return { status: 'ok', time: new Date().toISOString() };
  }
}
