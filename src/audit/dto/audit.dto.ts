import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AuditStrategy } from '../types/audit.type';

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

export class FindAuditsDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsEnum(AuditStrategy)
  strategy?: AuditStrategy;
}
