import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module';
import { UsersRepository } from './repo/users.repository';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [RolesModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
