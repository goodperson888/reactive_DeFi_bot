# 完整测试指南

本文档提供从本地单元测试到链上端到端测试的完整命令和说明。

---

## 前置准备

### 1. 环境变量配置

在项目根目录（`reactive_DeFi_bot/`）创建 `.env` 文件：

```bash
# 钱包私钥（不需要 0x 前缀）
PRIVATE_KEY=你的私钥

# RPC 节点（可使用默认公共节点，也可替换为 Alchemy/Infura）
SEPOLIA_RPC_URL=https://rpc.sepolia.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
REACTIVE_RPC_URL=https://lasna-rpc.rnk.dev/

# Etherscan 验证（可选，合约验证时使用）
ETHERSCAN_API_KEY=你的API密钥
```

### 2. 各链测试币准备

| 链 | 用途 | 获取方式 |
|----|------|----------|
| Sepolia ETH | 部署 Origin 合约 + 清算演示 | Sepolia Faucet |
| Base Sepolia ETH | 部署 Destination 合约 + 套利演示 | Base Faucet / Bridge from Sepolia |
| Lasna ETH | 部署 RC 合约 + 事件订阅 | Reactive Network 官方桥接（从 Sepolia 桥） |

**所需资金估算：**
- Sepolia：约 0.15 ETH（部署 + 演示）
- Base Sepolia：约 0.1 ETH（部署 + 注资）
- Lasna：少量 gas（部署 RCController）

---

## 第一阶段：本地单元测试（不消耗测试币）

### 命令

```bash
# 步骤 1：安装依赖
npm install

# 步骤 2：编译合约（生成 artifacts/ 目录，后续部署脚本依赖此目录）
npx hardhat compile

# 步骤 3：运行全部单元测试
npx hardhat test
```

### 预期输出

```
  MockLending
    存款和借款
      ✓ 应该允许用户存入抵押品
      ✓ 应该允许用户借款
      ✓ 健康度过低时应该拒绝借款
    健康度计算
      ✓ 应该正确计算健康度
      ✓ 无债务时健康度应该是最大值
    清算
      ✓ 健康度 < 1 时应该允许清算
      ✓ 健康度 >= 1 时应该拒绝清算
    事件触发
      ✓ 存款时应该触发 HealthFactorUpdated 事件
      ✓ 价格变化时应该触发 HealthFactorUpdated 事件

  MockDEX
    ...（同上）

  LiquidationExecutor
    ✓ sets RC and vault on deploy
    ✓ allows RC to execute liquidation
    ✓ rejects non-RC caller
    ✓ accumulates profit and execution count
    ✓ allows vault to withdraw ETH balance

  ArbitrageExecutor
    ✓ sets RC and vault on deploy
    ✓ allows RC to execute arbitrage
    ✓ rejects non-RC caller
    ✓ accumulates configured minProfit
```

### 测试覆盖范围

| 合约 | 测试内容 |
|------|----------|
| MockLending | 存款、借款、还款、清算、健康度计算、事件触发 |
| MockDEX | 流动性添加、ETH↔USDC Swap、价格设置、流动性不足拒绝 |
| LiquidationExecutor | 权限控制、清算执行、利润累计、ETH 提取 |
| ArbitrageExecutor | 权限控制、套利执行（ETH 和 USDC 两个方向）、利润累计 |

> **注意：** `RCController.react()` 带有 `vmOnly` 修饰符，本地无法直接调用，跨链逻辑需在链上验证。

---

## 第二阶段：链上部署（多链一键完成）

### 命令

```bash
# 步骤 4：部署所有合约
node scripts/deploy/deploy-all.js
```

### 该命令执行的 4 个步骤

**步骤 1/4 — Origin 链（Sepolia）**
- 部署 `MockLending`（借贷协议）
- 部署 `MockDEX A`（含 0.05 ETH 初始流动性）

**步骤 2/4 — Destination 链（Base Sepolia）**
- 部署 `MockDEX B`（含 0.05 ETH 初始流动性）
- 部署 `LiquidationExecutor`
- 部署 `ArbitrageExecutor`

**步骤 3/4 — Reactive Network（Lasna）**
- 部署 `RCController`，构造函数自动执行：
  - 订阅 Sepolia `MockLending` 的 `HealthFactorUpdated` 事件
  - 订阅 Sepolia `MockDEX A` 的 `Swap` 事件

**步骤 4/4 — 更新权限 + 注资**
- 调用 `LiquidationExecutor.updateRCController(rcAddr)` — 只允许 RC 调用
- 调用 `ArbitrageExecutor.updateRCController(rcAddr)` — 只允许 RC 调用
- 向 `ArbitrageExecutor` 注入 0.02 ETH 作为套利资金

### 预期输出

```
Starting deployment. MODE=mock

Origin deployer:      0xYourAddress
Destination deployer: 0xYourAddress
Reactive deployer:    0xYourAddress

[1/4] Deploying origin contracts on sepolia...
  MockLending: 0xAAA...
  MockDEX A:   0xBBB...

[2/4] Deploying destination contracts on base_sepolia...
  MockDEX B:            0xCCC...
  LiquidationExecutor:  0xDDD...
  ArbitrageExecutor:    0xEEE...

[3/4] Deploying RCController on lasna...
  RCController: 0xFFF...

[4/4] Updating executor RC controller addresses on base_sepolia...
  Executors updated.

[4b] Funding ArbitrageExecutor on base_sepolia...
  ArbitrageExecutor funded: 0.02 ETH

=== Deployment Summary ===
...
Saved to .env
```

合约地址自动保存到 `.env` 文件，后续脚本直接读取。

---

## 第三阶段：清算流程端到端测试

### 命令

```bash
# 步骤 5：在 Sepolia 上触发清算场景
npx hardhat run scripts/tasks/demo-liquidation.js --network sepolia
```

### 执行流程与链上事件链

```
用户（你的钱包）
  │
  ├─ deposit(0.05 ETH) ──────────────────────────────────────────────────────────────────────
  │   └─ Sepolia: MockLending emit HealthFactorUpdated(user, HF=max, 150, 0)
  │
  ├─ borrow(100e6 USDC) ─────────────────────────────────────────────────────────────────────
  │   └─ Sepolia: MockLending emit HealthFactorUpdated(user, HF=1.2e18, 150, 100)
  │
  └─ setEthPrice(2400e18) ───────────────────────────────────────────────────────────────────
      └─ Sepolia: MockLending emit HealthFactorUpdated(user, HF=0.96e18, 120, 100)
                                                          │
                                          Reactive Network 捕获事件
                                          调用 RCController.react(log)
                                          检查: 0.96e18 < 1.02e18  ✓
                                          检查: debt(1e20) > minLiq(1e19)  ✓
                                          emit LiquidationTriggered
                                          emit Callback(84532, liquidationExecutor, payload)
                                                          │
                                          Base Sepolia: Reactive Network 中继
                                          调用 LiquidationExecutor.executeLiquidation(
                                              11155111, mockLending, user, 1e20)
                                          emit LiquidationExecuted
                                          totalProfit += 5e18, executionCount = 1
```

### 验证

在 [Sepolia Etherscan](https://sepolia.etherscan.io/) 搜索 `MockLending` 地址，确认 `HealthFactorUpdated` 事件被触发。

在 [Base Sepolia Basescan](https://sepolia.basescan.org/) 搜索 `LiquidationExecutor` 地址，确认 `LiquidationExecuted` 事件被触发（等待 Reactive Network 中继，通常数十秒至数分钟）。

---

## 第四阶段：套利流程端到端测试

### 命令

```bash
# 步骤 6：触发套利场景（多链脚本，不用 npx hardhat run）
node scripts/tasks/demo-arbitrage.js
```

### 执行流程与链上事件链

```
脚本
  │
  ├─ mockDexA.setPrice(3000e6) ─── Sepolia: MockDEX A 价格 = 3000 USDC/ETH
  ├─ mockDexB.setPrice(3050e6) ─── Base Sepolia: MockDEX B 价格 = 3050 USDC/ETH
  │
  └─ mockDexA.swapETHForUSDC(0.01 ETH) ─────────────────────────────────────────────────────
      └─ Sepolia: MockDEX A emit Swap(user, ETH, USDC, 0.01e18, 30e6, 3000e6)
                                          │
                          Reactive Network 捕获事件
                          调用 RCController.react(log)
                          解析: newPrice = 3000e6
                          staticcall mockDexB.getPrice() → 3050e6
                          spreadPct = (3050-3000)*10000/3000 = 166 (1.66%)
                          检查: 166 > 150 (1.5% 阈值)  ✓
                          Gas 检查: expectedProfit > gasEstimate  ✓
                          方向: 3000 <= 3050 → tokenIn=ETH
                          emit ArbitrageTriggered(3000e6, 3050e6, 166)
                          emit Callback(84532, arbitrageExecutor, payload)
                                          │
                          Base Sepolia: Reactive Network 中继
                          调用 ArbitrageExecutor.executeArbitrage(
                              dexA, dexB, ETH, USDC, 0.01e18, minProfit)
                          IDEX(dexB).swapETHForUSDC{value: 0.01 ETH}()
                          emit ArbitrageExecuted
                          totalProfit += minProfit, executionCount = 1
```

### 验证

在 [Sepolia Etherscan](https://sepolia.etherscan.io/) 确认 `MockDEX A` 的 `Swap` 事件。

在 [Base Sepolia Basescan](https://sepolia.basescan.org/) 确认 `ArbitrageExecutor` 的 `ArbitrageExecuted` 事件。

---

## 第五阶段：状态查询与熔断机制测试

### 5.1 查询合约状态

```bash
# 查询 RCController（Lasna 链）
npx hardhat console --network lasna
```

```js
const rc = await ethers.getContractAt("RCController", process.env.RC_CONTROLLER_ADDRESS)

await rc.paused()                             // false：运行中
await rc.consecutiveLosses()                  // 0：无连续亏损
await rc.liquidationHealthFactorThreshold()   // 1020000000000000000 (1.02e18)
await rc.arbitrageSpreadThreshold()           // 150 (1.5%)
await rc.minLiqDebtUSD()                      // 10000000000000000000 ($10 in 18 decimals)
```

```bash
# 查询执行统计（Base Sepolia 链）
npx hardhat console --network base_sepolia
```

```js
const liq = await ethers.getContractAt("LiquidationExecutor", process.env.LIQUIDATION_EXECUTOR_ADDRESS)
await liq.executionCount()  // 清算执行次数
await liq.totalProfit()     // 累计模拟利润（USDC 1e6 单位）

const arb = await ethers.getContractAt("ArbitrageExecutor", process.env.ARBITRAGE_EXECUTOR_ADDRESS)
await arb.executionCount()  // 套利执行次数
await arb.totalProfit()     // 累计预期利润（ETH wei）
```

---

### 5.2 熔断机制测试

```bash
npx hardhat console --network lasna
```

```js
const rc = await ethers.getContractAt("RCController", process.env.RC_CONTROLLER_ADDRESS)
const [signer] = await ethers.getSigners()

// 模拟连续亏损（owner 根据链下监控结果调用）
await rc.connect(signer).recordLoss()
await rc.consecutiveLosses()  // → 1

await rc.connect(signer).recordLoss()
await rc.consecutiveLosses()  // → 2

await rc.connect(signer).recordLoss()
await rc.consecutiveLosses()  // → 3
await rc.paused()             // → true（熔断触发，系统自动暂停）

// 排查根因后手动恢复
await rc.connect(signer).resetCircuitBreaker()
await rc.paused()             // → false（恢复运行）
await rc.consecutiveLosses()  // → 0（计数重置）
```

---

### 5.3 策略参数调整（可选）

```js
// 调整清算触发阈值（例如改为 1.05）
await rc.connect(signer).updateThresholds(
    ethers.parseUnits("1.05", 18),  // healthFactor 阈值
    150                              // spread 阈值（保持不变）
)

// 调整最小清算债务门槛（例如改为 $50）
await rc.connect(signer).updateMinLiqDebt(ethers.parseUnits("50", 18))

// 暂停 / 恢复（手动操作）
await rc.connect(signer).pause()
await rc.connect(signer).unpause()
```

---

## 完整功能验证对照表

| 功能 | 验证方式 | 预期结果 |
|------|----------|----------|
| 跨链事件监听 | 部署后触发 Sepolia 事件，查看 Lasna 上 `react()` 被调用 | Reactive Network Explorer 可见交易 |
| 清算条件自动判断 | 运行 `demo-liquidation.js`，观察 `LiquidationTriggered` 事件 | HF < 1.02 时触发 |
| 套利条件自动判断 | 运行 `demo-arbitrage.js`，观察 `ArbitrageTriggered` 事件 | spread > 1.5% 时触发 |
| Gas 成本保护 | 设置极小债务（< $10）后触发 `HealthFactorUpdated`，观察是否触发 | 不触发清算 |
| 双向套利方向 | 将 Base Sepolia DEX 价格设为低于 Sepolia，观察 `tokenIn=USDC` | ArbitrageExecuted 中 tokenIn 为 USDC |
| 无服务器运行 | 部署后不运行任何脚本，等待链上价格变化 | 自动触发，无需手动干预 |
| Callback 跨链中继 | 查看 Base Sepolia Executor 的交易来源 | `msg.sender` 为 Reactive Network 系统地址 |
| Executor 利润记录 | 执行后查询 `executionCount` 和 `totalProfit` | 数值递增 |
| 熔断机制 | 调用 `recordLoss()` 3 次 | `paused=true` 且触发 `CircuitBreakerTriggered` 事件 |

---

## 常见问题

**Q：部署脚本报错 "Artifact not found"**
A：先运行 `npx hardhat compile`，确保 `artifacts/` 目录存在。

**Q：demo-arbitrage.js 没有触发套利**
A：检查 Reactive Network 是否已成功订阅事件（查看部署时的 `Subscribed` 事件）；确认价差超过 1.5% 且 Gas 检查通过（测试网 gas price 极低时检查始终通过）。

**Q：ArbitrageExecutor 报错 "Insufficient ETH"**
A：检查 ArbitrageExecutor 余额，部署脚本已注入 0.02 ETH，如不够可追加：
```js
await signer.sendTransaction({ to: arbExecutorAddr, value: ethers.parseEther("0.05") })
```

**Q：在 Lasna 上无法找到 RCController**
A：确认 `REACTIVE_RPC_URL` 配置正确，Lasna chainId 为 `5318007`。

---

**文档日期：** 2026-03-26
**项目：** Reactive DeFi Bot
