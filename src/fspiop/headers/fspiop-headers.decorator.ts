import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { FSPIOP_HEADERS } from './fspiop-headers.constants.js';
import type { FspiopInboundHeaders } from './fspiop-headers.interface.js';

/**
 * Parses and validates FSPIOP headers from a raw headers object.
 */
export function parseFspiopHeaders(
  headers: Record<string, unknown> = {},
): FspiopInboundHeaders {
  const source = headers[FSPIOP_HEADERS.SOURCE];
  if (!source) {
    throw new BadRequestException(
      `Missing mandatory FSPIOP header: '${FSPIOP_HEADERS.SOURCE}'`,
    );
  }

  return {
    source: String(source),
    destination: headers[FSPIOP_HEADERS.DESTINATION]
      ? String(headers[FSPIOP_HEADERS.DESTINATION])
      : undefined,
    date: headers[FSPIOP_HEADERS.DATE]
      ? String(headers[FSPIOP_HEADERS.DATE])
      : new Date().toUTCString(),
    httpMethod: headers[FSPIOP_HEADERS.HTTP_METHOD]
      ? String(headers[FSPIOP_HEADERS.HTTP_METHOD])
      : undefined,
    signature: headers[FSPIOP_HEADERS.SIGNATURE]
      ? String(headers[FSPIOP_HEADERS.SIGNATURE])
      : undefined,
  };
}

/**
 * Custom NestJS Parameter Decorator to extract and validate FSPIOP headers.
 */
export const FspiopHeaders = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): FspiopInboundHeaders => {
    const request = ctx.switchToHttp().getRequest();
    return parseFspiopHeaders(request.headers || {});
  },
);
