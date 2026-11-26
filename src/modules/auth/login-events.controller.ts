import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { LoginEventListQueryDto } from './dto/auth.dto';
import { LoginEventsService } from './login-events.service';

@ApiTags('Team')
@Controller('login-events')
@RequirePermissions(Permission.TeamView)
export class LoginEventsController {
  constructor(private readonly events: LoginEventsService) {}

  @Get()
  list(@Query() query: LoginEventListQueryDto) {
    return this.events.list(query);
  }
}
