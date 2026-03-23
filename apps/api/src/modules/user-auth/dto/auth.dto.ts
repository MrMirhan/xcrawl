import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class SigninDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  proxyUrls?: string[];

  @IsOptional()
  @IsString()
  llmProvider?: string;

  @IsOptional()
  @IsString()
  llmApiKey?: string;

  @IsOptional()
  @IsString()
  llmModel?: string;

  @IsOptional()
  @IsString()
  llmBaseUrl?: string;

  @IsOptional()
  @IsString()
  searxngUrl?: string;
}
