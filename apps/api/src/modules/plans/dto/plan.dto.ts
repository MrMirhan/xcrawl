import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsPositive,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LimitOverridesDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  dailyPageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weeklyPageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  dailySearchLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weeklySearchLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  dailyExtractLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weeklyExtractLimit?: number | null;
}

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  dailyPageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weeklyPageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  dailySearchLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weeklySearchLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  dailyExtractLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weeklyExtractLimit?: number | null;

  @IsBoolean()
  canUseOwnLlm: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  dailyPageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weeklyPageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  dailySearchLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weeklySearchLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  dailyExtractLimit?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weeklyExtractLimit?: number | null;

  @IsOptional()
  @IsBoolean()
  canUseOwnLlm?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateUserPlanDto {
  @IsString()
  planId: string;
}

export class UpdateUserLimitsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => LimitOverridesDto)
  limitOverrides?: LimitOverridesDto;

  @IsOptional()
  @IsBoolean()
  canUseOwnLlmOverride?: boolean | null;
}