import { IsArray, IsUrl, IsOptional, IsString, IsBoolean, IsNumber, IsIn } from 'class-validator';

export class BatchScrapeRequestDto {
  @IsArray()
  @IsUrl({}, { each: true })
  urls: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  formats?: string[];

  @IsOptional()
  @IsBoolean()
  onlyMainContent?: boolean;

  @IsOptional()
  @IsNumber()
  timeout?: number;

  @IsOptional()
  @IsIn(['auto', 'cheerio', 'playwright'])
  engine?: string;

  @IsOptional()
  @IsUrl()
  webhookUrl?: string;
}
