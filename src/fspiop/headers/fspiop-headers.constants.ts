/**
 * Standard FSPIOP Header names defined in the Mojaloop FSPIOP API Specification v1.1.
 * HTTP headers are case-insensitive in HTTP/1.1 and lowercase in HTTP/2.
 */
export const FSPIOP_HEADERS = {
  SOURCE: 'fspiop-source',
  DESTINATION: 'fspiop-destination',
  HTTP_METHOD: 'fspiop-http-method',
  SIGNATURE: 'fspiop-signature',
  DATE: 'date',
} as const;

/**
 * Standard FSPIOP Content-Types (vendor-specific MIME types with versioning).
 * Mojaloop requires these exact MIME types instead of standard application/json.
 */
export const FSPIOP_CONTENT_TYPES = {
  PARTIES: 'application/vnd.interoperability.parties+json;version=1.1',
  QUOTES: 'application/vnd.interoperability.quotes+json;version=1.1',
  TRANSFERS: 'application/vnd.interoperability.transfers+json;version=1.1',
  ERRORS: 'application/vnd.interoperability.errors+json;version=1.1',
} as const;
