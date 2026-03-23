import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from '../http-exception.filter';

function buildHost(mockResponse: Record<string, jest.Mock>): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockResponse: Record<string, jest.Mock>;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockResponse = { status: mockStatus, json: mockJson };
    host = buildHost(mockResponse);
  });

  describe('HttpException', () => {
    it('uses the HTTP exception status code', () => {
      const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    });

    it('returns success: false in the response body', () => {
      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
    });

    it('returns the correct statusCode in the JSON body', () => {
      const exception = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: HttpStatus.BAD_REQUEST }),
      );
    });

    it('uses the string response as the error message when response is a string', () => {
      const exception = new HttpException('Custom message', HttpStatus.CONFLICT);

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Custom message' }),
      );
    });

    it('uses the message field from an object response', () => {
      const exception = new HttpException(
        { message: 'Validation failed', statusCode: 422 },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation failed' }),
      );
    });

    it('handles NotFoundException (404) correctly', () => {
      const { NotFoundException } = require('@nestjs/common');
      const exception = new NotFoundException('Resource not found');

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, statusCode: HttpStatus.NOT_FOUND }),
      );
    });
  });

  describe('generic Error (non-HTTP)', () => {
    it('returns 500 status code', () => {
      const exception = new Error('Something exploded');

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('does not leak the raw error message to the client', () => {
      const exception = new Error('DB connection string: postgres://admin:secret@localhost');

      filter.catch(exception, host);

      const jsonArg = mockJson.mock.calls[0][0];
      expect(jsonArg.error).not.toContain('DB connection string');
      expect(jsonArg.error).not.toContain('postgres://');
    });

    it('returns the generic "Internal server error" message', () => {
      const exception = new Error('private info');

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Internal server error' }),
      );
    });

    it('returns success: false for generic errors', () => {
      filter.catch(new Error('boom'), host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      );
    });

    it('returns statusCode 500 in the JSON body', () => {
      filter.catch(new Error('boom'), host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR }),
      );
    });
  });

  describe('non-Error thrown values', () => {
    it('returns 500 when a plain object is thrown', () => {
      filter.catch({ some: 'object' }, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('returns 500 when a string is thrown', () => {
      filter.catch('something went wrong', host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('returns 500 when null is thrown', () => {
      filter.catch(null, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('returns the generic "Internal server error" message for non-Error values', () => {
      filter.catch(42, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Internal server error' }),
      );
    });
  });
});
