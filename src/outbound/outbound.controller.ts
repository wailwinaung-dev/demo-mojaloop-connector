import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { OutboundService } from './outbound.service.js';
import { CallbackWaiterService } from './waiter/callback-waiter.service.js';
import type { PartyResponsePayload } from '../inbound/dto/party.dto.js';
import type { FspiopErrorPayload } from '../fspiop/errors/fspiop-error.model.js';

@Controller()
export class OutboundController {
  constructor(
    private readonly outboundService: OutboundService,
    private readonly waiterService: CallbackWaiterService,
  ) {}

  /**
   * Client-facing Synchronous API for Party Lookup.
   * Mobile Apps / CBS can invoke this endpoint to resolve account names.
   *
   * Example: GET /api/parties/lookup?type=MSISDN&id=0911111111
   */
  @Get('api/parties/lookup')
  public async lookupParty(
    @Query('type') type: string,
    @Query('id') id: string,
  ): Promise<PartyResponsePayload> {
    return await this.outboundService.lookupParty(type, id);
  }

  /**
   * Inbound Asynchronous Callback Endpoint from Mojaloop Switch (PUT /parties/{Type}/{ID}).
   * Resolves the pending waiter Promise so the client API can return.
   */
  @Put('parties/:type/:id')
  public handlePartyCallback(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: PartyResponsePayload,
    @Res() res: Response,
  ): void {
    const correlationKey = `party:${type.toUpperCase()}:${id}`;
    this.waiterService.resolve(correlationKey, body);

    // Acknowledge receipt of the callback to the Switch
    res.status(HttpStatus.OK).send();
  }

  /**
   * Inbound Asynchronous Error Callback from Mojaloop Switch (PUT /parties/{Type}/{ID}/error).
   */
  @Put('parties/:type/:id/error')
  public handlePartyErrorCallback(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: FspiopErrorPayload,
    @Res() res: Response,
  ): void {
    const correlationKey = `party:${type.toUpperCase()}:${id}`;
    this.waiterService.reject(correlationKey, body);

    // Acknowledge receipt of the error callback to the Switch
    res.status(HttpStatus.OK).send();
  }
}
