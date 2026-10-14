import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FspiopHeaders, type FspiopInboundHeaders } from '../fspiop/index.js';
import { InboundService } from './inbound.service.js';
import type { QuoteRequestPayload } from './dto/quote.dto.js';

@Controller()
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  /**
   * Inbound Party Discovery Endpoint (GET /parties/{Type}/{ID}).
   *
   * Mojaloop Specification Rule:
   * 1. Must respond immediately with HTTP 202 Accepted (empty body).
   * 2. Asynchronously queries account information and sends a PUT callback.
   */
  @Get('parties/:type/:id')
  public getParty(
    @Param('type') type: string,
    @Param('id') id: string,
    @FspiopHeaders() headers: FspiopInboundHeaders,
    @Res() res: Response,
  ): void {
    // 1. Immediate acknowledgment with 202 Accepted according to FSPIOP spec
    res.status(HttpStatus.ACCEPTED).send();

    // 2. Perform CBS resolution and dispatch callback asynchronously
    void this.inboundService.handlePartyLookup(type, id, headers.source);
  }

  /**
   * Inbound Quote Agreement Endpoint (POST /quotes).
   *
   * Mojaloop Specification Rule:
   * 1. Must respond immediately with HTTP 202 Accepted (empty body).
   * 2. Asynchronously calculates fees, generates ILP condition & packet, and sends PUT /quotes/{id} callback.
   */
  @Post('quotes')
  public postQuote(
    @Body() body: QuoteRequestPayload,
    @FspiopHeaders() headers: FspiopInboundHeaders,
    @Res() res: Response,
  ): void {
    // 1. Immediate acknowledgment with 202 Accepted according to FSPIOP spec
    res.status(HttpStatus.ACCEPTED).send();
    // 2. Perform quoting, cryptographic derivation, and dispatch callback asynchronously
    void this.inboundService.handleQuoteRequest(body, headers.source);
  }
}
