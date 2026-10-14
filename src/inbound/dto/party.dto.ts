/**
 * Mojaloop Specification FSPIOP v1.1 Party Data Models.
 * Section 6.2 - Parties
 */

export interface PartyIdInfo {
  /** Identifier type (e.g. 'MSISDN', 'ACCOUNT_ID', 'EMAIL', 'IBAN') */
  partyIdType: string;
  /** The identifier value (e.g. '0911111111') */
  partyIdentifier: string;
  /** Optional sub-identifier */
  partySubIdOrType?: string;
  /** The DFSP ID that hosts this account */
  fspId: string;
}

export interface PartyComplexName {
  firstName?: string;
  middleName?: string;
  lastName?: string;
}

export interface PartyPersonalInfo {
  complexName?: PartyComplexName;
  dateOfBirth?: string;
}

export interface Party {
  partyIdInfo: PartyIdInfo;
  /** Display name of the account holder */
  name: string;
  personalInfo?: PartyPersonalInfo;
}

/**
 * Standard callback body payload for PUT /parties/{Type}/{ID}
 */
export interface PartyResponsePayload {
  party: Party;
}
