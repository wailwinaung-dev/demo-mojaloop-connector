import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwsService } from './jws.service.js';
import { FSPIOP_HEADERS } from '../../fspiop/headers/fspiop-headers.constants.js';

/**
 * NestJS Guard that verifies the FSPIOP JWS signature on inbound requests.
 *
 * Per the FSPIOP specification:
 * - Only requests with a body (PUT, POST, PATCH) carry a JWS signature.
 * - GET and DELETE requests are allowed through without verification.
 *
 * On verification failure, a 403 Forbidden is thrown to prevent the
 * controller from processing an unauthenticated or tampered message.
 */
@Injectable()
export class JwsVerificationGuard implements CanActivate {
  private readonly logger = new Logger(JwsVerificationGuard.name);

  constructor(private readonly jwsService: JwsService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const method = request.method?.toUpperCase();

    // GET and DELETE have no body, so no JWS per FSPIOP spec
    if (method === 'GET' || method === 'DELETE') {
      return true;
    }

    const signature = request.headers[FSPIOP_HEADERS.SIGNATURE];
    const source = request.headers[FSPIOP_HEADERS.SOURCE];

    if (!signature) {
      this.logger.warn(
        `Inbound ${method} request from '${source || 'unknown'}' is missing the '${FSPIOP_HEADERS.SIGNATURE}' header`,
      );
      throw new ForbiddenException(
        `Missing required header: '${FSPIOP_HEADERS.SIGNATURE}'`,
      );
    }

    if (!source) {
      this.logger.warn(
        `Inbound ${method} request is missing the '${FSPIOP_HEADERS.SOURCE}' header — cannot verify JWS`,
      );
      throw new ForbiddenException(
        `Missing required header: '${FSPIOP_HEADERS.SOURCE}'`,
      );
    }

    const uri = request.path || request.url;
    const date =
      request.headers[FSPIOP_HEADERS.DATE] ||
      (request.headers['date'] as string | undefined);

    const isValid = this.jwsService.verify({
      signatureHeader: signature,
      sourceFsp: source,
      uri,
      httpMethod: method,
      body: request.body,
      rawBody: request.rawBody,
      date,
    });

    if (!isValid) {
      this.logger.warn(
        `JWS verification FAILED for inbound ${method} ${uri} request from DFSP '${source}'`,
      );
      throw new ForbiddenException(
        'JWS signature verification failed — request rejected',
      );
    }

    this.logger.debug(
      `JWS verification passed for inbound ${method} ${uri} request from DFSP '${source}'`,
    );
    return true;
  }
}
