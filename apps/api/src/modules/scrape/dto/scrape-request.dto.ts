import { IsString, IsUrl, IsOptional, IsArray, IsBoolean, IsNumber, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

class BrowserActionDto {
  @IsIn(['click', 'type', 'scroll', 'wait', 'waitForSelector', 'screenshot', 'executeJavascript'])
  type: string;

  @IsOptional()
  @IsString()
  selector?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsNumber()
  milliseconds?: number;

  @IsOptional()
  @IsIn(['up', 'down'])
  direction?: string;

  @IsOptional()
  @IsString()
  code?: string;
}

export class ScrapeRequestDto {
  @IsUrl()
  url: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  formats?: string[];

  @IsOptional()
  @IsBoolean()
  onlyMainContent?: boolean;

  @IsOptional()
  @IsNumber()
  waitFor?: number;

  @IsOptional()
  @IsNumber()
  timeout?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BrowserActionDto)
  actions?: BrowserActionDto[];

  @IsOptional()
  headers?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includeTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeTags?: string[];

  @IsOptional()
  @IsBoolean()
  mobile?: boolean;

  @IsOptional()
  @IsIn(['auto', 'cheerio', 'playwright'])
  engine?: string;

  /** Auto-dismiss popups and cookie banners (Playwright only, default: true) */
  @IsOptional()
  @IsBoolean()
  dismissPopups?: boolean;

  /** JSON schema for structured extraction (triggers LLM extraction) */
  @IsOptional()
  extractSchema?: Record<string, unknown>;

  /** Natural language prompt for extraction (triggers LLM extraction) */
  @IsOptional()
  @IsString()
  extractPrompt?: string;
}
