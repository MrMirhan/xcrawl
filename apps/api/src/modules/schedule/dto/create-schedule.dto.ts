import { IsString, IsOptional, IsBoolean, IsIn, IsObject } from 'class-validator';

export class CreateScheduleDto {
  @IsString()
  name: string;

  @IsIn(['SCRAPE', 'CRAWL'])
  type: string;

  // Cron expression (e.g., "0 0 * * *" for daily)
  @IsString()
  cron: string;

  /** Full scrape/crawl configuration */
  @IsObject()
  config: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enableChangeDetection?: boolean;

  @IsOptional()
  @IsString()
  webhookUrl?: string;
}
