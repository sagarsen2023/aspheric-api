import { IsOptional, IsString } from 'class-validator';

export class BasePaginationDto {
  @IsOptional()
  @IsString()
  skip?: number;

  @IsOptional()
  @IsString()
  limit?: number;
}
