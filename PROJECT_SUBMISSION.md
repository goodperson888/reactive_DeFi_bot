## Project Submission

> Please fill content after ">".

**ProjectName** (Required)  
> Using RC for On-Chain Automated Liquidation and Arbitrage

**ProjectDescription** (Required)  
> This project demonstrates practical usage of Reactive Contracts (RC) for event-driven DeFi automation across multiple chains.  
> We combine automated liquidation monitoring on Sepolia with cross-chain arbitrage execution between Sepolia and Base Sepolia.  
> The key value is to reduce manual operations, improve execution reliability, and provide transparent end-to-end observability through both on-chain transactions and frontend activity logs.

**Github Repo Link** (Open-source repository, required)  
> https://github.com/goodperson888/reactive_DeFi_bot/tree/dev

**Team Lead** (Required)  
> justinli

**Team Wallet Address** (List all team members and wallets, comma separated)  
> justinli:0x03821460938885DCDBe111236A2da58607aB276D

---

## Post-Deployment Workflow (Step-by-Step Runtime Logic)

1. Deploy the full testnet stack with `deploy:user-flow:testnet`.  
   This deploys and links:
   - Origin (Sepolia): `MockLending`, `MockDEX A`
   - Destination (Base Sepolia): `UserVault`, `MockDEX B`
   - Reactive: `RCFactory`
   It then syncs addresses into `.env` and `frontend/.env.local`.

2. Open frontend and configure strategy in `/app/strategy`, then save config to Vault.

3. Complete dashboard onboarding in `/app/dashboard`:
   - Step 1: Deposit funds on Base Sepolia
   - Step 2: Deploy user RC on Reactive Lasna
   - Step 3: Sync RC address back to Base Vault
   After sync, strategy status becomes `Running`.

4. Run liquidation demo on Sepolia:
   - Trigger health-factor changes (price update)
   - Execute liquidation successfully
   - Verify by terminal receipts and frontend activity logs

5. Run cross-chain arbitrage demo:
   - Base leg: ETH -> USDC
   - Sepolia leg: USDC -> ETH
   - Verify synthetic spread and successful execution

6. Verify observability:
   - Terminal confirms each transaction hash
   - Frontend `/app/activity` shows health updates, liquidation, and arbitrage logs

---

## Complete Transaction Hash Records

### Reactive Transactions

- RC deployment (`RCDeployed`):  
  `0x8fb524d5f3db857f6633d52cf37bc0c7b4fc1a39e26300282595915fe4a346cc`

### Destination Transactions (Base Sepolia)

- Vault deposit (frontend step):  
  `0x12d3af5e09c1d8fa120e23f9c09cb429f39319695c47682d8e94a9a4df496820`

- Arbitrage setup (DEX B price update):  
  `0xc70e5f3957a0a7dec0db1d7157cfdbee58d75441041d6610685313e76f1a11fb`

- Arbitrage execution (Base sell ETH -> USDC):  
  `0xc1669a2bcc3f2d1032ec9a8429bd241a7727693526adab76816de48aae159f85`

### Origin Transactions (Sepolia)

- Liquidation trigger (set ETH price):  
  `0x1878b1214f5476bc2a91ac761755eb93615cfd41a76a32c4e84be3174e691286`

- Liquidation execution:  
  `0x4bf37274dde1fcf32f87c847d1fab391ba93ed8d957bd8fc7c3a27df031ad05d`

- Arbitrage setup (DEX A price update):  
  `0x057caa3f41772becdcf88afa861adc186d09c332e55eccb3d6dc79bd26819332`

- Arbitrage execution (Sepolia buy USDC -> ETH):  
  `0x0fa74beadc535213a40976fd7efa88ed0751c289142631b9052a1645a936fe6c`

---

## Deployed Contract Addresses

### Reactive

- RCFactory: `0xA595E5274444EEea642EcaD0b1d449d4E2341412`
- User RC: `0xaB281bfeeeD36C08C94b651ED33503De276c5c45`

### Origin (Sepolia)

- MockLending: `0x4eb43Aa910415411C4f1CC4c0C6466E22E26AB8E`
- MockDEX A: `0xa415e945c4e9e31a00647416Ca9869f3A3bba399`

### Destination (Base Sepolia)

- UserVault: `0xb134d649C6d8f2FcE5acb5c6267546240E83c1f6`
- MockDEX B: `0x3754Bc7F2F27C9Fb64DAE4177C9239F66576c894`

---

## Demo Outcome Summary

- Sepolia liquidation path executed successfully with on-chain proof and frontend log visibility.
- Cross-chain arbitrage path (Base -> Sepolia) executed successfully with positive synthetic spread.
- The full user flow (deposit -> RC deploy -> sync -> run -> monitor) completed end-to-end.
- The project shows how Reactive Contracts can power reliable, transparent, and automation-first DeFi workflows.
