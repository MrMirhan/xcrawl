import { UnauthorizedException } from '@nestjs/common';
import { ownedWhere } from '../ownership';

describe('ownedWhere', () => {
  const id = 'resource-id-123';

  describe('when userId is provided', () => {
    it('returns a where clause scoped by id and userId', () => {
      const result = ownedWhere(id, { userId: 'user-abc' });
      expect(result).toEqual({ id, userId: 'user-abc' });
    });

    it('userId takes precedence when both userId and apiKeyId are provided', () => {
      const result = ownedWhere(id, { userId: 'user-abc', apiKeyId: 'key-xyz' });
      expect(result).toEqual({ id, userId: 'user-abc' });
      expect(result).not.toHaveProperty('apiKeyId');
    });
  });

  describe('when only apiKeyId is provided', () => {
    it('returns a where clause scoped by id and apiKeyId', () => {
      const result = ownedWhere(id, { apiKeyId: 'key-xyz' });
      expect(result).toEqual({ id, apiKeyId: 'key-xyz' });
    });

    it('does not include userId in the result', () => {
      const result = ownedWhere(id, { apiKeyId: 'key-xyz' });
      expect(result).not.toHaveProperty('userId');
    });
  });

  describe('when neither userId nor apiKeyId is provided', () => {
    it('throws UnauthorizedException', () => {
      expect(() => ownedWhere(id, {})).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException with descriptive message', () => {
      expect(() => ownedWhere(id, {})).toThrow('Cannot determine resource owner');
    });

    it('throws UnauthorizedException when auth is empty object', () => {
      expect(() => ownedWhere(id, {})).toThrow(UnauthorizedException);
    });
  });

  describe('id passthrough', () => {
    it('includes the provided id in the result regardless of auth method', () => {
      const specificId = 'specific-resource-id';
      expect(ownedWhere(specificId, { userId: 'u1' })).toMatchObject({ id: specificId });
      expect(ownedWhere(specificId, { apiKeyId: 'k1' })).toMatchObject({ id: specificId });
    });
  });
});
