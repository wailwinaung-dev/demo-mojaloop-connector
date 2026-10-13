/**
 * Represents the strongly-typed incoming FSPIOP headers extracted from an HTTP request.
 */
export interface FspiopInboundHeaders {
  /**
   * The identifier of the sending participant (e.g., 'dfsp-a' or the central switch).
   */
  source: string;

  /**
   * The identifier of the target destination participant (e.g., 'dfsp-b').
   */
  destination?: string;

  /**
   * The timestamp of the message formatted as an HTTP-date (RFC 7231).
   */
  date: string;

  /**
   * Optional HTTP method passed when proxied by the switch.
   */
  httpMethod?: string;

  /**
   * Optional JSON Web Signature (JWS) string for message authenticity.
   */
  signature?: string;
}
