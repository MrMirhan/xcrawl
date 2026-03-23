import { IsUrl, IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

export class MapRequestDto {
  @IsUrl()
  url: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  includeSitemap?: boolean;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
