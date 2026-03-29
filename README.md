# Reactive DeFi Bot

## Demo Video (Watch First)
### https://drive.google.com/file/d/1MFKEIXMb1FmwmQwbT4pYfaBnVYZzWQQY/view?usp=drive_link

Reactive DeFi Bot is an event-driven DeFi automation project built with **Reactive Contract (RC)** architecture.

It demonstrates two production-style workflows on testnets:
- **Automated liquidation** (risk management) on **Sepolia**
- **Cross-chain arbitrage** between **Base Sepolia** and **Sepolia**

The product experience is designed as a clear frontend flow:
**Deposit -> Deploy RC -> Sync RC -> Run -> Monitor Logs -> Withdraw**

---

## Why This Project

Manual DeFi operations are slow and error-prone, especially when execution windows are short.
This project turns strategy execution into a repeatable, observable pipeline:

- Event monitoring on origin chain(s)
- Reactive trigger and execution routing
- User-facing status + activity log verification
- End-to-end testnet reproducibility

---

## Core Capabilities

1. **RC-based Event Automation**
   - Uses `RCFactory` + per-user `UserRC` to automate strategy reactions.

2. **Liquidation Path (Sepolia)**
   - Monitors health factor related state and executes liquidation logic in demo workflow.

3. **Cross-Chain Arbitrage Path (Base <-> Sepolia)**
   - Simulates two-leg arbitrage with configurable DEX prices and on-chain transaction proofs.

4. **Frontend-Guided User Flow**
   - Strategy configuration, deposit, RC deployment, RC sync, runtime controls, and activity logs.

---

## High-Level Architecture

```text
Origin (Sepolia):      MockLending / MockDEX A / risk events
           |
           v
Reactive Layer:        RCFactory -> UserRC (event-driven automation)
           |
           v
Destination (Base):    UserVault / MockDEX B / user-facing funds flow
           |
           v
Frontend:              Dashboard + Strategy + Activity Log
```

---

## Repository Structure

```text
reactive_DeFi_bot/
  contracts/
    destination/
    mocks/
    reactive/
  scripts/
    deploy/
    tasks/
  frontend/
  config/
  test/
  hardhat.config.cjs
  package.json
```

---

## Tech Stack

- **Solidity + Hardhat**
- **Node.js**
- **Next.js frontend** (inside `frontend/`)
- **EVM testnets**: Sepolia, Base Sepolia, Reactive testnet (Lasna)

---

## Prerequisites

- Node.js 20+ (Node 22 also works)
- npm
- Testnet wallet with gas on:
  - Sepolia
  - Base Sepolia
  - Reactive testnet

---

## Environment Setup

From project root:

```bash
cp .env.example .env
```

Set your private key and RPC values in `.env`.

Also ensure frontend env is synced when deployment updates addresses:

```bash
npm run sync:frontend-env
```

---

## Install

```bash
npm install
npm install --prefix frontend
```

---

## Main Commands

```bash
# Compile and test
npm run compile
npm test

# Deploy user-flow stack (testnet)
npm run deploy:user-flow:testnet

# Start frontend
npm run frontend:dev

# Demo scripts
npm run demo:liquidation:testnet
npm run demo:arbitrage:testnet
```

---

## Recommended Testnet Demo Flow

1. Deploy contracts and sync env:
   - `npm run deploy:user-flow:testnet`
2. Start frontend:
   - `npm run frontend:dev`
3. Open:
   - `http://127.0.0.1:3000`
4. In frontend:
   - Connect wallet
   - Configure strategy (`/app/strategy`)
   - Deposit, deploy RC, sync RC (`/app/dashboard`)
5. Run liquidation demo:
   - `npm run demo:liquidation:testnet`
6. Run arbitrage demo:
   - `npm run demo:arbitrage:testnet`
7. Verify:
   - Terminal transaction receipts
   - Frontend activity logs (`/app/activity`)

---

## Notes

- This repository contains both:
  - user-facing RC flow (`UserVault + RCFactory + UserRC`)
  - legacy demo paths kept for reference
- Prefer the **user-flow path** for frontend demonstration and product walkthrough.

---

## Security & Usage Notice

- This project is for educational/testnet demonstration.
- Do not use test private keys on mainnet.
- Validate all addresses and environment values before running scripts.

---

## License

MIT

