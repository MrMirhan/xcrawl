import { IsArray, IsUrl, IsOptional, IsString, IsObject } from 'class-validator';

export class ExtractRequestDto {
  @IsArray()
  @IsUrl({}, { each: true })
  urls: string[];

  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsObject()
  llm?: {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  };
}
