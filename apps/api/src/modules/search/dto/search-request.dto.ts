import { IsString, IsOptional, IsArray, IsNumber, IsIn } from 'class-validator';

export class SearchRequestDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  formats?: string[];

  @IsOptional()
  @IsIn(['auto', 'cheerio', 'playwright'])
  engine?: string;

  /** SearXNG instance URL (defaults to env SEARXNG_URL) */
  @IsOptional()
  @IsString()
  searxngUrl?: string;
}
