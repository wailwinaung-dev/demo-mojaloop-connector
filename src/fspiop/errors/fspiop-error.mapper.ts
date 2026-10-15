import axios, { AxiosError } from 'axios';
import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  RequestTimeoutException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FSPIOP_ERROR_CODES } from './fspiop-error-codes.js';
import type { FspiopErrorPayload } from './fspiop-error.model.js';

export interface StructuredHttpErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  mojaloopErrorCode: string;
}

/**
 * Universal error mapper that converts:
 * 1. Axios HTTP errors (Network ECONNREFUSED, Timeout, Switch 4xx/5xx HTTP responses)
 * 2. Mojaloop FSPIOP error payloads (from asynchronous callbacks)
 * into standardized NestJS HttpExceptions.
 */
export function mapFspiopErrorToHttpException(
  payload: FspiopErrorPayload | any,
): HttpException {
  // If already an HttpException, return directly
  if (payload instanceof HttpException) {
    return payload;
  }

  // Handle Axios Errors (from synchronous HTTP dispatches in try/catch)
  if (axios.isAxiosError(payload) || payload?.isAxiosError) {
    const axiosErr = payload as AxiosError<any>;

    // 1. Connection Timeout
    if (axiosErr.code === 'ECONNABORTED' || axiosErr.code === 'ETIMEDOUT') {
      return new GatewayTimeoutException({
        statusCode: HttpStatus.GATEWAY_TIMEOUT,
        error: 'Gateway Timeout',
        message: 'Connection to Mojaloop Switch timed out',
        mojaloopErrorCode: FSPIOP_ERROR_CODES.DESTINATION_COMMUNICATION_ERROR,
      });
    }

    // 2. Server responded with HTTP status code (4xx, 5xx)
    if (axiosErr.response) {
      const respData = axiosErr.response.data;

      // If Mojaloop Switch returned a canonical errorInformation JSON body
      if (respData?.errorInformation?.errorCode) {
        return mapPayloadToHttpException(respData);
      }

      // If Switch or reverse proxy responded with HTTP error without FSPIOP body
      const status = axiosErr.response.status;
      const message =
        (typeof respData === 'string' ? respData : respData?.message) ||
        axiosErr.message ||
        'HTTP error from Mojaloop Switch';

      if (status === 404) {
        return new NotFoundException({
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message,
          mojaloopErrorCode: FSPIOP_ERROR_CODES.GENERIC_ID_NOT_FOUND,
        });
      }
      if (status === 503) {
        return new ServiceUnavailableException({
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          error: 'Service Unavailable',
          message,
          mojaloopErrorCode: FSPIOP_ERROR_CODES.GENERIC_SERVICE_UNAVAILABLE,
        });
      }
      if (status === 504) {
        return new GatewayTimeoutException({
          statusCode: HttpStatus.GATEWAY_TIMEOUT,
          error: 'Gateway Timeout',
          message,
          mojaloopErrorCode: FSPIOP_ERROR_CODES.DESTINATION_COMMUNICATION_ERROR,
        });
      }
      if (status >= 500) {
        return new BadGatewayException({
          statusCode: HttpStatus.BAD_GATEWAY,
          error: 'Bad Gateway',
          message,
          mojaloopErrorCode: FSPIOP_ERROR_CODES.GENERIC_SERVER_ERROR,
        });
      }
      return new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message,
        mojaloopErrorCode: 'SWITCH_HTTP_ERROR',
      });
    }

    // 3. Network Connection Failure (ECONNREFUSED, ENOTFOUND, etc.)
    if (
      axiosErr.request ||
      axiosErr.code === 'ECONNREFUSED' ||
      axiosErr.code === 'ENOTFOUND'
    ) {
      const errCode = axiosErr.code || 'ECONNREFUSED';
      return new BadGatewayException({
        statusCode: HttpStatus.BAD_GATEWAY,
        error: 'Bad Gateway',
        message: `Cannot connect to Mojaloop Switch (${errCode})`,
        mojaloopErrorCode: FSPIOP_ERROR_CODES.GENERIC_COMMUNICATION_ERROR,
      });
    }
  }

  return mapPayloadToHttpException(payload);
}

function mapPayloadToHttpException(payload: any): HttpException {
  const errorInfo =
    payload?.errorInformation || payload?.response?.data?.errorInformation;
  const rawCode = errorInfo?.errorCode;
  const code = rawCode ? String(rawCode).trim() : 'UNKNOWN';
  const description =
    errorInfo?.errorDescription ||
    payload?.message ||
    'Mojaloop Switch error occurred';

  const buildResponse = (
    status: HttpStatus,
    errorName: string,
  ): StructuredHttpErrorResponse => ({
    statusCode: status,
    error: errorName,
    message: description,
    mojaloopErrorCode: code,
  });

  // ==========================================
  // Tier 1: Specific Known Scenarios
  // ==========================================
  switch (code) {
    // 3200 / 3201: Party or Destination FSP does not exist
    case FSPIOP_ERROR_CODES.GENERIC_ID_NOT_FOUND:
    case FSPIOP_ERROR_CODES.DESTINATION_FSP_NOT_FOUND:
      return new NotFoundException(buildResponse(HttpStatus.NOT_FOUND, 'Not Found'));

    // 3202 / 3203: Customer account inactive, suspended, or blocked
    case FSPIOP_ERROR_CODES.ID_NOT_ACTIVE:
    case FSPIOP_ERROR_CODES.ID_BLOCKED:
      return new UnprocessableEntityException(
        buildResponse(HttpStatus.UNPROCESSABLE_ENTITY, 'Unprocessable Entity'),
      );

    // 3301: Quote expired
    case FSPIOP_ERROR_CODES.QUOTE_EXPIRED:
      return new RequestTimeoutException(
        buildResponse(HttpStatus.REQUEST_TIMEOUT, 'Request Timeout'),
      );

    // 2001 / 2003: Switch or service unavailable
    case FSPIOP_ERROR_CODES.GENERIC_SERVICE_UNAVAILABLE:
    case FSPIOP_ERROR_CODES.SERVICE_DISABLED:
      return new ServiceUnavailableException(
        buildResponse(HttpStatus.SERVICE_UNAVAILABLE, 'Service Unavailable'),
      );


    // 2000 / 2002: Internal Switch errors
    case FSPIOP_ERROR_CODES.GENERIC_SERVER_ERROR:
    case FSPIOP_ERROR_CODES.INTERNAL_SERVER_ERROR:
      return new BadGatewayException(buildResponse(HttpStatus.BAD_GATEWAY, 'Bad Gateway'));

    // 1000 / 1001: Network communication errors
    case FSPIOP_ERROR_CODES.GENERIC_COMMUNICATION_ERROR:
    case FSPIOP_ERROR_CODES.DESTINATION_COMMUNICATION_ERROR:
      return new GatewayTimeoutException(
        buildResponse(HttpStatus.GATEWAY_TIMEOUT, 'Gateway Timeout'),
      );

    // 4100 / 4101: Cryptographic ILP condition tampering or mismatch
    case FSPIOP_ERROR_CODES.GENERIC_SECURITY_ERROR:
    case FSPIOP_ERROR_CODES.INVALID_SIGNATURE:
      return new UnprocessableEntityException(
        buildResponse(HttpStatus.UNPROCESSABLE_ENTITY, 'Unprocessable Entity'),
      );

    // 5000 / 5100: Transfer and ledger settlement errors
    case FSPIOP_ERROR_CODES.GENERIC_TRANSFER_ERROR:
    case FSPIOP_ERROR_CODES.GENERIC_PAYER_ERROR:
      return new BadGatewayException(buildResponse(HttpStatus.BAD_GATEWAY, 'Bad Gateway'));

  }

  // ==========================================
  // Tier 2: Range-Based Categorization Fallback
  // ==========================================
  const codeNum = parseInt(code, 10);
  if (!isNaN(codeNum)) {
    if (codeNum >= 1000 && codeNum < 2000) {
      // 1xxx: Network / Communication errors
      return new GatewayTimeoutException(
        buildResponse(HttpStatus.GATEWAY_TIMEOUT, 'Gateway Timeout'),
      );
    }
    if (codeNum >= 2000 && codeNum < 3000) {
      // 2xxx: Switch / Server infrastructure errors
      return new ServiceUnavailableException(
        buildResponse(HttpStatus.SERVICE_UNAVAILABLE, 'Service Unavailable'),
      );
    }
    if (codeNum >= 3000 && codeNum < 4000) {
      // 3xxx: Data, syntax & party validation errors
      return new BadRequestException(
        buildResponse(HttpStatus.BAD_REQUEST, 'Bad Request'),
      );
    }
    if (codeNum >= 4000 && codeNum < 5000) {
      // 4xxx: Security & Authorization errors
      return new UnprocessableEntityException(
        buildResponse(HttpStatus.UNPROCESSABLE_ENTITY, 'Unprocessable Entity'),
      );
    }
    if (codeNum >= 5000 && codeNum < 6000) {
      // 5xxx: Transfer & Liquidity business errors
      return new BadRequestException(
        buildResponse(HttpStatus.BAD_REQUEST, 'Bad Request'),
      );
    }
  }

  // ==========================================
  // Tier 3: Unclassified / Mock Fallback (e.g. 6001)
  // ==========================================
  return new BadRequestException(
    buildResponse(HttpStatus.BAD_REQUEST, 'Bad Request'),
  );
}
