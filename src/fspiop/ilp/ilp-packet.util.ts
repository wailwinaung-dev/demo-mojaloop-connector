/**
 * Interledger Protocol (ILP) Prepare Packet Builder and Parser.
 *
 * Implements the ASN.1 OER (Octet Encoding Rules) binary format defined by ILP v4 (RFC 27)
 * and utilized across Mojaloop Quotes and Transfers.
 *
 * Structure of an ILP Prepare Packet (Type 12 / 0x0c):
 * - Type: 1 byte (0x0c)
 * - Amount: 8 bytes (UInt64 big-endian)
 * - Expiration: 17 bytes (ASCII YYYYMMDDHHMMSSmmmZ)
 * - Execution Condition: 32 bytes (SHA-256 digest buffer)
 * - Destination ILP Address: Variable-length string (e.g. 'g.mojaloop.dfsp-b.0911111111')
 * - Data: Variable-length application data buffer (JSON or opaque)
 */

export interface IlpPreparePacketParams {
  /** Transfer amount as an integer string or number (e.g. "100" or 100) */
  amount: string | number;
  /** 43-character Base64url SHA-256 condition string */
  executionCondition: string;
  /** Expiration Date or ISO string */
  expiresAt: Date | string;
  /** Destination ILP address (e.g. 'g.mojaloop.dfsp-b.0911111111') */
  destination: string;
  /** Optional transaction metadata */
  data?: Record<string, unknown> | string;
}

export interface ParsedIlpPreparePacket {
  amount: string;
  executionCondition: string;
  expiresAt: string;
  destination: string;
  data: unknown;
}

const ILP_PREPARE_TYPE = 12; // 0x0c

/**
 * Encodes a buffer with an OER variable-length prefix.
 */
function encodeVarOctetString(buf: Buffer): Buffer {
  const len = buf.length;
  if (len < 128) {
    return Buffer.concat([Buffer.from([len]), buf]);
  } else if (len < 256) {
    return Buffer.concat([Buffer.from([0x81, len]), buf]);
  } else {
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(len);
    return Buffer.concat([Buffer.from([0x82]), lenBuf, buf]);
  }
}

/**
 * Reads an OER variable-length buffer starting from offset.
 */
function readVarOctetString(
  buf: Buffer,
  offset: number,
): { data: Buffer; newOffset: number } {
  const firstByte = buf.readUInt8(offset);
  offset += 1;

  let length: number;
  if (firstByte < 128) {
    length = firstByte;
  } else if (firstByte === 0x81) {
    length = buf.readUInt8(offset);
    offset += 1;
  } else if (firstByte === 0x82) {
    length = buf.readUInt16BE(offset);
    offset += 2;
  } else {
    throw new Error(`Unsupported OER length prefix: ${firstByte}`);
  }

  const data = buf.subarray(offset, offset + length);
  return { data, newOffset: offset + length };
}

/**
 * Formats a Date into a standard 17-character ILP timestamp (YYYYMMDDHHMMSSmmmZ).
 */
export function formatIlpTimestamp(dateOrIso: Date | string): string {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');

  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  const millis = pad(d.getUTCMilliseconds(), 3);

  return `${year}${month}${day}${hours}${minutes}${seconds}${millis}`;
}

/**
 * Creates a standard Base64url-encoded ILP Prepare packet for Mojaloop Quotes/Transfers.
 */
export function createIlpPreparePacket(
  params: IlpPreparePacketParams,
): string {
  // 1. Amount: 8-byte unsigned integer (BigUInt64BE)
  const amountBigInt = BigInt(Math.round(Number(params.amount)));
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64BE(amountBigInt);

  // 2. Expiry: 17 bytes ASCII
  const expiryStr = formatIlpTimestamp(params.expiresAt);
  const expiryBuf = Buffer.from(expiryStr, 'ascii');

  // 3. Execution Condition: 32 bytes buffer
  const conditionBuf = Buffer.from(params.executionCondition, 'base64url');
  if (conditionBuf.length !== 32) {
    throw new Error(
      `Condition buffer must be exactly 32 bytes, got ${conditionBuf.length}`,
    );
  }

  // 4. Destination ILP Address: OER VarOctetString
  const destinationBuf = encodeVarOctetString(
    Buffer.from(params.destination, 'utf8'),
  );

  // 5. Data payload: OER VarOctetString
  let dataContent: Buffer;
  if (!params.data) {
    dataContent = Buffer.alloc(0);
  } else if (typeof params.data === 'string') {
    dataContent = Buffer.from(params.data, 'utf8');
  } else {
    dataContent = Buffer.from(JSON.stringify(params.data), 'utf8');
  }
  const dataBuf = encodeVarOctetString(dataContent);

  // 6. Concatenate packet contents
  const packetContents = Buffer.concat([
    amountBuf,
    expiryBuf,
    conditionBuf,
    destinationBuf,
    dataBuf,
  ]);

  // 7. Envelope with Type (12) + Content length
  const fullPacket = Buffer.concat([
    Buffer.from([ILP_PREPARE_TYPE]),
    encodeVarOctetString(packetContents),
  ]);

  return fullPacket.toString('base64url');
}

/**
 * Parses and extracts data from a Base64url-encoded ILP Prepare packet.
 */
export function parseIlpPreparePacket(
  base64urlPacket: string,
): ParsedIlpPreparePacket {
  const buf = Buffer.from(base64urlPacket, 'base64url');

  const type = buf.readUInt8(0);
  if (type !== ILP_PREPARE_TYPE) {
    throw new Error(
      `Invalid ILP Packet Type: expected ${ILP_PREPARE_TYPE}, got ${type}`,
    );
  }

  // Read wrapped content
  const { data: contents } = readVarOctetString(buf, 1);

  let offset = 0;

  // 1. Amount (8 bytes)
  const amountBigInt = contents.readBigUInt64BE(offset);
  offset += 8;

  // 2. Expiry (17 bytes)
  const expiresAt = contents.subarray(offset, offset + 17).toString('ascii');
  offset += 17;

  // 3. Condition (32 bytes)
  const condition = contents.subarray(offset, offset + 32).toString('base64url');
  offset += 32;

  // 4. Destination
  const { data: destBuf, newOffset: destOffset } = readVarOctetString(
    contents,
    offset,
  );
  const destination = destBuf.toString('utf8');
  offset = destOffset;

  // 5. Data
  const { data: dataBuf } = readVarOctetString(contents, offset);
  let parsedData: unknown = dataBuf.toString('utf8');
  try {
    if (dataBuf.length > 0) {
      parsedData = JSON.parse(dataBuf.toString('utf8'));
    }
  } catch {
    // Keep as raw string if not JSON
  }

  return {
    amount: amountBigInt.toString(),
    executionCondition: condition,
    expiresAt,
    destination,
    data: parsedData,
  };
}
