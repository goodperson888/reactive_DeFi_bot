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

## On-Chain Proof (Successful End-to-End Test Run)

### Complete Transaction Hash Records

#### Reactive Transactions

- RC deployment (`RCDeployed`):  
  `0x8fb524d5f3db857f6633d52cf37bc0c7b4fc1a39e26300282595915fe4a346cc`

#### Destination Transactions (Base Sepolia)

- Vault deposit (frontend step):  
  `0x12d3af5e09c1d8fa120e23f9c09cb429f39319695c47682d8e94a9a4df496820`

- Arbitrage setup (DEX B price update):  
  `0xc70e5f3957a0a7dec0db1d7157cfdbee58d75441041d6610685313e76f1a11fb`

- Arbitrage execution (Base sell ETH -> USDC):  
  `0xc1669a2bcc3f2d1032ec9a8429bd241a7727693526adab76816de48aae159f85`

#### Origin Transactions (Sepolia)

- Liquidation trigger (set ETH price):  
  `0x1878b1214f5476bc2a91ac761755eb93615cfd41a76a32c4e84be3174e691286`

- Liquidation execution:  
  `0x4bf37274dde1fcf32f87c847d1fab391ba93ed8d957bd8fc7c3a27df031ad05d`

- Arbitrage setup (DEX A price update):  
  `0x057caa3f41772becdcf88afa861adc186d09c332e55eccb3d6dc79bd26819332`

- Arbitrage execution (Sepolia buy USDC -> ETH):  
  `0x0fa74beadc535213a40976fd7efa88ed0751c289142631b9052a1645a936fe6c`

### Deployed Contract Addresses

#### Reactive

- RCFactory: `0xA595E5274444EEea642EcaD0b1d449d4E2341412`
- User RC: `0xaB281bfeeeD36C08C94b651ED33503De276c5c45`

#### Origin (Sepolia)

- MockLending: `0x4eb43Aa910415411C4f1CC4c0C6466E22E26AB8E`
- MockDEX A: `0xa415e945c4e9e31a00647416Ca9869f3A3bba399`

#### Destination (Base Sepolia)

- UserVault: `0xb134d649C6d8f2FcE5acb5c6267546240E83c1f6`
- MockDEX B: `0x3754Bc7F2F27C9Fb64DAE4177C9239F66576c894`

### Demo Outcome Summary

- Sepolia liquidation path executed successfully with on-chain proof and frontend log visibility.
- Cross-chain arbitrage path (Base -> Sepolia) executed successfully with positive synthetic spread.
- The full user flow (deposit -> RC deploy -> sync -> run -> monitor) completed end-to-end.
- The project shows how Reactive Contracts can power reliable, transparent, and automation-first DeFi workflows.

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
