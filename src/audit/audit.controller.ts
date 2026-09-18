import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { CreateAuditDto, FindAuditsDto } from './dto/audit.dto';
import { RateLimit, RateLimitGuard } from './guards/rate-limit.guard';
import { AuditStatus } from './types/audit.type';
import type { Request } from 'express';
import { clientIdentifier } from './providers/client-ip';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Roles, RolesGuard } from '../auth/guards/role.guard';
import { UserRoles } from '../user/types/user.type';

@Controller('audit')
@UseGuards(RateLimitGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ limit: 5, windowSeconds: 60 })
  async create(
    @Body() createAuditDto: CreateAuditDto,
    @Req() request: Request,
  ) {
    const audit = await this.auditService.create(
      createAuditDto,
      clientIdentifier(request),
    );

    return {
      data: audit,
      message:
        audit.status === AuditStatus.COMPLETED
          ? 'Returning a recent report for this URL. Send refresh=true to force a new run.'
          : `Audit queued. Poll GET /audit/${audit.auditId} for the report.`,
    };
  }

  @Get()
  @UseGuards(AuthGuard)
  @RateLimit({ limit: 60, windowSeconds: 60 })
  findAll(@Query() findAuditsDto: FindAuditsDto) {
    return this.auditService.findAll(findAuditsDto);
  }

  @Get(':auditId')
  @RateLimit({ limit: 120, windowSeconds: 60 })
  findOne(@Param('auditId') auditId: string) {
    return this.auditService.findOne(auditId);
  }
}
