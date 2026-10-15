import { describe, expect, it } from 'vitest';
import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  NotFoundException,
  RequestTimeoutException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { mapFspiopErrorToHttpException } from './fspiop-error.mapper.js';

describe('mapFspiopErrorToHttpException', () => {
  it('should map 3200 Generic ID Not Found to NotFoundException (404)', () => {
    const payload = {
      errorInformation: {
        errorCode: '3200',
        errorDescription: 'Party not found',
      },
    };

    const exception = mapFspiopErrorToHttpException(payload);
    expect(exception).toBeInstanceOf(NotFoundException);
    expect(exception.getStatus()).toBe(404);

    const res: any = exception.getResponse();
    expect(res.statusCode).toBe(404);
    expect(res.error).toBe('Not Found');
    expect(res.message).toBe('Party not found');
    expect(res.mojaloopErrorCode).toBe('3200');
  });

  it('should map 3201 Destination FSP Not Found to NotFoundException (404)', () => {
    const payload = {
      errorInformation: {
        errorCode: '3201',
        errorDescription: 'Destination FSP not found',
      },
    };

    const exception = mapFspiopErrorToHttpException(payload);
    expect(exception).toBeInstanceOf(NotFoundException);
    expect(exception.getStatus()).toBe(404);
  });

  it('should map 3202/3203 ID Not Active / Blocked to UnprocessableEntityException (422)', () => {
    const payload = {
      errorInformation: {
        errorCode: '3202',
        errorDescription: 'ID suspended or closed',
      },
    };

    const exception = mapFspiopErrorToHttpException(payload);
    expect(exception).toBeInstanceOf(UnprocessableEntityException);
    expect(exception.getStatus()).toBe(422);
  });

  it('should map 3301 Quote Expired to RequestTimeoutException (408)', () => {
    const payload = {
      errorInformation: {
        errorCode: '3301',
        errorDescription: 'Quote has expired',
      },
    };

    const exception = mapFspiopErrorToHttpException(payload);
    expect(exception).toBeInstanceOf(RequestTimeoutException);
    expect(exception.getStatus()).toBe(408);
  });


  it('should map 2001 Service Unavailable to ServiceUnavailableException (503)', () => {
    const payload = {
      errorInformation: {
        errorCode: '2001',
        errorDescription: 'Switch unavailable',
      },
    };

    const exception = mapFspiopErrorToHttpException(payload);
    expect(exception).toBeInstanceOf(ServiceUnavailableException);
    expect(exception.getStatus()).toBe(503);
  });

  it('should map 1001 Destination Communication Error to GatewayTimeoutException (504)', () => {
    const payload = {
      errorInformation: {
        errorCode: '1001',
        errorDescription: 'Communication timeout',
      },
    };

    const exception = mapFspiopErrorToHttpException(payload);
    expect(exception).toBeInstanceOf(GatewayTimeoutException);
    expect(exception.getStatus()).toBe(504);
  });

  it('should map 3100 validation error to BadRequestException (400)', () => {
    const payload = {
      errorInformation: {
        errorCode: '3100',
        errorDescription: 'Missing mandatory element',
      },
    };

    const exception = mapFspiopErrorToHttpException(payload);
    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getStatus()).toBe(400);
  });

  it('should map unclassified mock codes like 6001 to BadRequestException (400)', () => {
    const payload = {
      errorInformation: {
        errorCode: '6001',
        errorDescription: 'This is a mock error description',
      },
    };

    const exception = mapFspiopErrorToHttpException(payload);
    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getStatus()).toBe(400);

    const res: any = exception.getResponse();
    expect(res.mojaloopErrorCode).toBe('6001');
    expect(res.message).toBe('This is a mock error description');
  });

  it('should handle null, undefined, or empty payload defensively without throwing', () => {
    expect(() => mapFspiopErrorToHttpException(null)).not.toThrow();
    expect(() => mapFspiopErrorToHttpException(undefined)).not.toThrow();
    expect(() => mapFspiopErrorToHttpException({})).not.toThrow();

    const exception = mapFspiopErrorToHttpException(null);
    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getStatus()).toBe(400);
  });

  describe('AxiosError scenarios', () => {
    it('should map ECONNREFUSED network failure to BadGatewayException (502)', () => {
      const axiosError = {
        isAxiosError: true,
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 127.0.0.1:4040',
        request: {},
      };

      const exception = mapFspiopErrorToHttpException(axiosError);
      expect(exception).toBeInstanceOf(BadGatewayException);
      expect(exception.getStatus()).toBe(502);

      const res: any = exception.getResponse();
      expect(res.mojaloopErrorCode).toBe('1000');
      expect(res.message).toContain('Cannot connect to Mojaloop Switch (ECONNREFUSED)');
    });

    it('should map ECONNABORTED timeout to GatewayTimeoutException (504)', () => {
      const axiosError = {
        isAxiosError: true,
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded',
        request: {},
      };

      const exception = mapFspiopErrorToHttpException(axiosError);
      expect(exception).toBeInstanceOf(GatewayTimeoutException);
      expect(exception.getStatus()).toBe(504);

      const res: any = exception.getResponse();
      expect(res.mojaloopErrorCode).toBe('1001');
      expect(res.message).toBe('Connection to Mojaloop Switch timed out');
    });

    it('should map Axios response with FSPIOP error payload to proper exception', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: {
            errorInformation: {
              errorCode: '3200',
              errorDescription: 'Party not found',
            },
          },
        },
      };

      const exception = mapFspiopErrorToHttpException(axiosError);
      expect(exception).toBeInstanceOf(NotFoundException);
      expect(exception.getStatus()).toBe(404);

      const res: any = exception.getResponse();
      expect(res.mojaloopErrorCode).toBe('3200');
    });

    it('should map generic HTTP 404 response to NotFoundException', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 404,
          data: 'Endpoint not found',
        },
      };

      const exception = mapFspiopErrorToHttpException(axiosError);
      expect(exception).toBeInstanceOf(NotFoundException);
      expect(exception.getStatus()).toBe(404);
    });

    it('should map generic HTTP 500 response to BadGatewayException (502)', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 500,
          data: { message: 'Switch internal crash' },
        },
      };

      const exception = mapFspiopErrorToHttpException(axiosError);
      expect(exception).toBeInstanceOf(BadGatewayException);
      expect(exception.getStatus()).toBe(502);
    });

    it('should pass through already-instantiated HttpException untouched', () => {
      const original = new NotFoundException('Already mapped');
      const result = mapFspiopErrorToHttpException(original);
      expect(result).toBe(original);
    });
  });
});
