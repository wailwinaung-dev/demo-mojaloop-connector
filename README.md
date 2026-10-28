# Mojaloop DFSP Connector (NestJS Demo)

A hands-on implementation of a **Mojaloop DFSP (Digital Financial Services Provider) Connector** built with **NestJS** and **TypeScript**. 

I built this project as a practical proof-of-concept to deeply explore how a financial institution (Bank / MFI / Mobile Wallet) integrates with the **Mojaloop National Switch** using the **FSPIOP v1.1** specification — focusing on the actual cryptographic and networking layers (bidirectional mTLS, JWS signing, ILP packets, and 2-Phase Commit transfers).

---

## 💡 What's Inside

- **Complete 3-Step Flow (FSPIOP v1.1):**
  - **Discovery:** Party / Account lookup (`GET /parties`, `PUT /parties`)
  - **Agreement:** Quote calculation & ILP Condition negotiation (`POST /quotes`, `PUT /quotes`)
  - **Execution:** Transfer execution with cryptographic fulfillment (`POST /transfers`, `PUT /transfers`)
- **Security & Cryptography:**
  - **Mutual TLS (mTLS):** Inbound HTTPS server certificate validation (`serverAuth` / `clientAuth`) and outbound client certificate handling.
  - **JWS (JSON Web Signature):** Request signing via Axios interceptors and inbound cryptographic signature verification guards (`RS256`).
  - **ILP (Interledger Protocol):** SHA-256 Condition generation and Fulfillment preimage verification.
- **2-Phase Commit (2PC) & CBS Simulator:**
  - In-memory mock Core Banking System (CBS) with balance reservation (hold) on initiation, followed by commit or rollback depending on Switch response.
- **Async Callback Correlation:**
  - An in-memory callback waiter that bridges Mojaloop's asynchronous Pub/Sub callback model with synchronous REST APIs for client apps.

---

## 🏗 Architecture Flow

```
[ Client / Mobile App ]
         │
         ▼ (Sync REST)
┌─────────────────────────────────────────────────────────┐
│              Mojaloop Connector (NestJS)                │
│                                                         │
│  1. Outbound Controller (/api/...)                      │
│  2. CBS Service (Hold Alice's funds)                    │
│  3. Callback Waiter Engine                              │
│  4. Security Layer (mTLS Agent + JWS RS256 Signer)      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼ (Async mTLS + JWS)
┌─────────────────────────────────────────────────────────┐
│            Mojaloop Switch / Testing Toolkit            │
│                 (Port :4040 / :3000)                    │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Requirements
- Node.js `>= 20`
- OpenSSL (for generating test keys & certificates)

### 2. Setup
```bash
# Clone the repository
git clone https://github.com/<your-username>/mojaloop-connector.git
cd mojaloop-connector

# Install dependencies
npm install

# Setup environment
cp .env.example .env
```

### 3. Generate Keys & Certificates (Local Testing)

```bash
# JWS RSA Key Pair
mkdir -p certs/jws
openssl genrsa -out certs/jws/dfsp-jws-private.pem 2048
openssl rsa -in certs/jws/dfsp-jws-private.pem -pubout -out certs/jws/dfsp-jws-public.pem

# Local mTLS Certificates
mkdir -p certs/tls/server certs/tls/client
openssl req -x509 -newkey rsa:4096 -days 3650 -nodes \
  -keyout certs/tls/server/dfsp_ca.key -out certs/tls/server/dfsp_ca.crt \
  -subj "/C=MM/O=DFSP-B/CN=DFSP-B-CA"

openssl req -new -newkey rsa:2048 -nodes \
  -keyout certs/tls/server/server.key -out certs/tls/server/server.csr \
  -subj "/C=MM/O=DFSP-B/CN=localhost"
openssl x509 -req -in certs/tls/server/server.csr \
  -CA certs/tls/server/dfsp_ca.crt -CAkey certs/tls/server/dfsp_ca.key -CAcreateserial \
  -out certs/tls/server/server.crt -days 365 -sha256 \
  -extfile <(echo -e "extendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1")

# Client Certificate for curl / Postman
openssl req -new -newkey rsa:2048 -nodes \
  -keyout certs/tls/test-client.key -out certs/tls/test-client.csr \
  -subj "/C=MM/O=DFSP-B/CN=test-client"
openssl x509 -req -in certs/tls/test-client.csr \
  -CA certs/tls/server/dfsp_ca.crt -CAkey certs/tls/server/dfsp_ca.key -CAcreateserial \
  -out certs/tls/test-client.crt -days 365 -sha256 \
  -extfile <(echo "extendedKeyUsage=clientAuth")
```

### 4. Run the Server
```bash
# Development mode
npm run start:dev

# Run unit tests
npm test
```

---

## 🧪 Testing the Flows

### Method A: Outbound Payer Flow (via curl)

Pre-seeded account: **Alice** (`0911111111`) with **$1,000 USD** balance.

```bash
# Step 1: Lookup Payee
curl -k --cert certs/tls/test-client.crt --key certs/tls/test-client.key \
  "https://localhost:3000/api/parties/lookup?type=MSISDN&id=0988888888"

# Step 2: Request Quote
curl -k --cert certs/tls/test-client.crt --key certs/tls/test-client.key \
  -X POST https://localhost:3000/api/quotes/request \
  -H "Content-Type: application/json" \
  -d '{
    "payerIdentifier": "0911111111",
    "payeeIdentifier": "0988888888",
    "payeeFsp": "testingtoolkitdfsp",
    "amount": "50.00",
    "currency": "USD"
  }'

# Step 3: Send Transfer (with condition & ilpPacket from Step 2)
curl -k --cert certs/tls/test-client.crt --key certs/tls/test-client.key \
  -X POST https://localhost:3000/api/transfers/send \
  -H "Content-Type: application/json" \
  -d '{
    "payerIdentifier": "0911111111",
    "payeeIdentifier": "0988888888",
    "payeeFsp": "testingtoolkitdfsp",
    "amount": "50.00",
    "currency": "USD",
    "condition": "<CONDITION_FROM_STEP_2>",
    "ilpPacket": "<ILP_PACKET_FROM_STEP_2>"
  }'
```

### Method B: Postman Collection
Import [`mojaloop-payer-outbound.postman_collection.json`](./mojaloop-payer-outbound.postman_collection.json) into Postman, set the client certificate under **Settings > Certificates**, and run the requests in order.

### Method C: Inbound Payee Flow (Mojaloop TTK)
Import [`ttk-full-p2p.json`](./ttk-full-p2p.json) into Mojaloop Testing Toolkit (TTK) to test incoming discovery, quote, and transfer callbacks against this connector.

---

## 📂 Project Structure

```
src/
├── cbs/            # Mock Core Banking System (Account Ledger, 2PC Holds)
├── config/         # Environment variables & Joi schema validation
├── fspiop/         # FSPIOP headers, error mapping, and ILP crypto utilities
├── inbound/        # Inbound Mojaloop endpoints (Connector as Payee)
├── outbound/       # Client REST APIs & Async Callback Waiter (Connector as Payer)
├── security/       # mTLS setup, JWS interceptor, and verification guard
└── main.ts         # NestJS entry point with HTTPS mTLS configuration
```
