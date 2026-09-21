import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AuditStrategy } from '../types/audit.type';
import { BasePaginationDto } from '../../common/dto/base-pagination.dto';
import { AUDIT_GRADES } from '../audit.constants';

export class CreateAuditDto {
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    {
      message: 'url must be an absolute http(s) URL, e.g. https://example.com',
    },
  )
  @MaxLength(2048)
  @IsNotEmpty()
  url!: string;

  @IsOptional()
  @IsEnum(AuditStrategy)
  strategy?: AuditStrategy;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  refresh?: boolean;
}

export class FindAuditsDto extends BasePaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsEnum(AuditStrategy)
  strategy?: AuditStrategy;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(AUDIT_GRADES)
  grade?: string;
}

export class AuditAnalyticsDto {
  /** Start of the range (ISO date). Defaults to 30 days before `to`. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  /** End of the range (ISO date). Defaults to now. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
