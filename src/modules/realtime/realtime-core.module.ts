import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

/** Global so any module can publish invalidations without import cycles. */
@Global()
@Module({
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeCoreModule {}
