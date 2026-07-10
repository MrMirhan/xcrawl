import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

export function assertAccountUsable(user: { role: string; isActive: boolean } | null): void {
  if (!user) throw new UnauthorizedException('User not found');
  if (!user.isActive) throw new ForbiddenException('Account disabled');
  if (user.role === 'PENDING') throw new ForbiddenException('Account pending admin approval');
}
