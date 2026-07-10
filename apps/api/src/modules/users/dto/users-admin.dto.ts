import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@xcrawl/db';

export class ApproveUserDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive: boolean;
}

export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}

export class UpdateUserPlanDto {
  @IsString()
  planId: string;
}

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

export class UpdateUserLimitsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => LimitOverridesDto)
  limitOverrides?: LimitOverridesDto;

  @IsOptional()
  @IsBoolean()
  canUseOwnLlmOverride?: boolean | null;
}
