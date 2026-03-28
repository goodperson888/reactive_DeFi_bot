# Reactive DeFi Bot 测试网演示手册 / Testnet Demo Guide

本手册是我们这次实际跑通流程的最终版（中英双语）。  
This guide is the final bilingual version based on the exact flow we successfully ran.

## 1. 终端分工 / Terminal Roles

- `终端A / Terminal A`: 前端服务（`frontend:dev`）
- `终端B / Terminal B`: 一键演示脚本（清算/套利）
- `终端C / Terminal C`: Hardhat Console 手动触发演示（可选）

项目根目录：`E:\reactive_contract_defi\reactive_DeFi_bot`

## 2. 一次性准备 / One-time Setup

在任意终端执行：  
Run in any terminal:

```powershell
cd E:\reactive_contract_defi\reactive_DeFi_bot
npm install
npm install --prefix frontend
```

部署并同步环境：  
Deploy contracts and sync frontend env:

```powershell
cd E:\reactive_contract_defi\reactive_DeFi_bot
npm run deploy:user-flow:testnet
npm run sync:frontend-env
```

预期结果 / Expected:

- 输出 `用户前端流部署完成 / deployment completed`
- `.env` 与 `frontend/.env.local` 更新完成

## 3. 启动前端 / Start Frontend

在终端A执行：  
Run in Terminal A:

```powershell
cd E:\reactive_contract_defi\reactive_DeFi_bot
npm run frontend:dev
```

访问：`http://localhost:3000`

## 4. 前端主流程演示 / Frontend Main Flow Demo

### 4.1 策略配置 / Strategy Config

页面：`/app/strategy`

1. 勾选要演示的策略（清算、套利）  
   Enable the strategies you want to demo (Liquidation, Arbitrage).
2. 点击 `保存到 Vault` 并在钱包确认  
   Click `Save to Vault` and confirm in wallet.

预期结果 / Expected:

- 保存交易成功，无报错

### 4.2 第一步：存款 / Step 1: Deposit

页面：`/app/dashboard`

1. 切到 `Base Sepolia`  
   Switch wallet to `Base Sepolia`.
2. 输入 `0.01`，点击 `存入`  
   Enter `0.01`, click `Deposit`.

预期结果 / Expected:

- 第一步变为已完成
- 页面进入第二步 `部署 RC`

### 4.3 第二步：部署 RC / Step 2: Deploy RC

1. 点击 `部署 RC`  
2. 按提示切到 `Reactive Lasna` 并确认交易  
   Switch to `Reactive Lasna` and confirm tx.

预期结果 / Expected:

- 显示 `同步 RC 地址到 Vault` 阶段

### 4.4 同步 RC 到 Vault / Sync RC to Vault

1. 切回 `Base Sepolia`  
2. 点击 `同步 RC 地址到 Vault` 并确认

预期结果 / Expected:

- 页面进入 `运行中`
- 可见 `暂停策略 / 暂停RC / 恢复RC`

## 5. 清算演示（脚本）/ Liquidation Demo (Script)

在终端B执行：  
Run in Terminal B:

```powershell
cd E:\reactive_contract_defi\reactive_DeFi_bot
npm run demo:liquidation:testnet
```

预期结果 / Expected:

- 终端出现 `Same-chain liquidation succeeded on Sepolia.`
- `activity` 页面出现 HF 更新与清算完成日志

## 6. 套利演示（脚本）/ Arbitrage Demo (Script)

在终端B执行：  
Run in Terminal B:

```powershell
cd E:\reactive_contract_defi\reactive_DeFi_bot
npm run demo:arbitrage:testnet
```

预期结果 / Expected:

- 终端出现 `Cross-chain arbitrage demo succeeded.`
- `activity` 页面新增 `dex_swap` 套利腿日志

## 7. 手动触发演示（可选）/ Manual Trigger Demo (Optional)

在终端C执行：  
Run in Terminal C:

```powershell
cd E:\reactive_contract_defi\reactive_DeFi_bot
npx hardhat console --network sepolia
```

进入 console 后：  
Inside console:

```javascript
const [me] = await ethers.getSigners()
const lending = await ethers.getContractAt("MockLending", process.env.MOCK_LENDING_ADDRESS)
await lending.positions(me.address)
```

如果 `debt = 0`，先建仓：  
If `debt = 0`, initialize position first:

```javascript
await (await lending.deposit({ value: ethers.parseEther("0.05") })).wait()
await (await lending.borrow(95_000000)).wait()
```

触发健康度下跌：  
Trigger health factor drop:

```javascript
await (await lending.setEthPrice(ethers.parseUnits("2300", 18))).wait()
ethers.formatUnits(await lending.getHealthFactor(me.address), 18)
await (await lending.setEthPrice(ethers.parseUnits("2100", 18))).wait()
ethers.formatUnits(await lending.getHealthFactor(me.address), 18)
```

若仍 `>= 1`，继续降到 `1900`。  
If HF is still `>= 1`, drop to `1900`.

手动清算（可选）：  
Manual liquidation (optional):

```javascript
await (await lending.liquidate(me.address, 45_000000)).wait()
await lending.positions(me.address)
```

## 8. 结果解读 / Result Interpretation

- `status: 1` = 交易成功 / tx succeeded
- `execution reverted: User not liquidatable` = 当前 HF 还没低于 1  
  HF is not below 1 yet.
- `Identifier has already been declared` = REPL 里重复 `const`，直接复用变量  
  You redeclared variables in REPL; reuse existing ones.
- `未实现利润 +0 ETH` 但 activity 有日志是正常的：  
  如果是直接调用底层合约（console/script），不一定写入 Base Vault 的利润口径。  
  `+0 ETH` in Vault with activity logs can be normal when actions are done directly on underlying contracts.

## 9. 日志风格说明 / Log Style Note

- 当前活动页同时展示：
  - 清算底层事件（HF、Liquidated）
  - 套利底层事件（Swap / dex_swap）
- 这是一种“链上事件日志”视角。  
  This is the on-chain event log view.

若你想看类似 `ExecutionResult` 的聚合日志，需要走 Vault/RC 自动执行闭环，而不是手动直接调用 `liquidate`。  
If you want `ExecutionResult`-style aggregated logs, actions must go through Vault/RC auto-execution path (not direct manual liquidation calls).

## 10. 快速命令清单 / Quick Command List

```powershell
cd E:\reactive_contract_defi\reactive_DeFi_bot
npm run deploy:user-flow:testnet
npm run sync:frontend-env
npm run frontend:dev
npm run demo:liquidation:testnet
npm run demo:arbitrage:testnet
npx hardhat console --network sepolia
```

