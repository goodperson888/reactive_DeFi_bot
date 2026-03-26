# 修改总汇

本文档记录本轮对项目的所有修改内容，涵盖功能补全、逻辑修复和测试资金优化。

---

## 一、RCController.sol（核心合约）

**文件路径：** `contracts/reactive/RCController.sol`

### 1.1 新增：熔断机制（Circuit Breaker）

**问题：** 需求文档要求"连续亏损 3 次 → 停止策略"，原合约未实现。

**修改内容：**

新增状态变量：
```solidity
uint256 public consecutiveLosses;           // 连续亏损计数
uint256 public constant MAX_CONSECUTIVE_LOSSES = 3;  // 熔断阈值
```

新增事件：
```solidity
event CircuitBreakerTriggered(uint256 indexed consecutiveLosses);
```

新增管理函数（由 owner 根据链下监控结果调用）：
```solidity
function recordLoss()          // 记录亏损，达到 3 次自动 paused=true 并触发熔断事件
function recordSuccess()       // 记录成功，重置计数为 0
function resetCircuitBreaker() // 排查后手动恢复：consecutiveLosses=0, paused=false
```

---

### 1.2 新增：Gas 成本保护

**问题：** 需求文档要求"gas 成本 > 利润 → 不执行"，原合约未实现。

**修改内容（清算侧）：**

新增状态变量：
```solidity
uint256 public minLiqDebtUSD = 10e18;  // 最小清算债务门槛（$10，18 decimals）
```

在 `_handleHealthFactorUpdate()` 中新增检查：
```solidity
if (totalDebt < minLiqDebtUSD) {
    return;  // 债务过小，gas 成本超过清算收益，跳过
}
```

新增配置函数：
```solidity
function updateMinLiqDebt(uint256 newMinDebtUSD) external  // 支持动态调整门槛
```

**修改内容（套利侧）：**

在 `_handleSwapEvent()` 中新增检查：
```solidity
uint256 amountIn = 1e16;
uint256 expectedProfitWei = (amountIn * spreadPct) / 10000;
uint256 gasEstimateWei = uint256(CALLBACK_GAS_LIMIT) * tx.gasprice;
if (expectedProfitWei <= gasEstimateWei) {
    return;  // 预期利润不足以覆盖 gas 成本，跳过
}
```

---

### 1.3 修复：套利方向双向判断

**问题：** 原代码始终假设 Origin DEX 价格更低，套利方向固定为 ETH→USDC，未处理反向价差场景。

**修改内容（`_handleSwapEvent()` 中）：**
```solidity
// 修改前：固定方向
address tokenIn = address(0);   // 始终 ETH

// 修改后：根据实际价差方向决定
if (newPrice <= priceB) {
    // Origin 便宜：在 Destination 高价卖出 ETH
    tokenIn = address(0);   // ETH → USDC
    tokenOut = address(1);
} else {
    // Destination 便宜：在 Destination 低价买入 ETH
    tokenIn = address(1);   // USDC → ETH
    tokenOut = address(0);
}
```

---

### 1.4 减少套利仓位

**修改：** `amountIn` 从 `1e17`（0.1 ETH）降至 `1e16`（0.01 ETH），节省测试资金，同时保持功能完整。

---

## 二、LiquidationExecutor.sol

**文件路径：** `contracts/destination/LiquidationExecutor.sol`

### 2.1 修复：totalProfit 单位混用

**问题：** `totalProfit` 以 USDC 微单位（1e6）记账，而 `withdrawProfit()` 提取的是真实 ETH，并在提取时 `totalProfit = 0`，造成单位混用和统计错误。

**修改内容：**

- 移除 `withdrawProfit()` 中的 `totalProfit = 0`，让 USDC 记账统计保持独立；
- 添加注释明确说明单位：

```solidity
/// @notice 累计模拟利润（单位与 debtAmount 相同，即 USDC 1e6 格式），仅用于统计，不对应真实 ETH
uint256 public totalProfit;
```

```solidity
// 注意：totalProfit 是 USDC 单位的虚拟记账值，与真实 ETH 余额是独立统计，不在此重置
```

---

## 三、ArbitrageExecutor.sol

**文件路径：** `contracts/destination/ArbitrageExecutor.sol`

### 3.1 说明：dexA 参数用途

**问题：** `executeArbitrage()` 接收 `dexA` 参数但函数体内从未调用，容易产生误解。

**修改内容：** 补充函数注释，明确说明 `dexA` 的作用：

```solidity
/// dexA 是 Origin 链 DEX 地址，仅用于事件溯源，无法跨链调用
/// dexB 是 Destination 链 DEX 地址，为实际交互对象
/// tokenIn/tokenOut 方向由 RCController 根据价差判断后传入
/// profit 以 minProfit (ETH wei) 记账，为预期最低收益
```

### 3.2 说明：profit 记账逻辑

**修改内容：** 明确注释说明 `totalProfit` 单位为 ETH wei（与 `minProfit` 和 `amountIn` 一致）：

```solidity
/// @notice 累计预期利润（ETH wei 单位，基于 minProfit 记账），与实际 ETH 余额变化为近似关系
uint256 public totalProfit;
```

---

## 四、scripts/deploy/deploy-all.js

**文件路径：** `scripts/deploy/deploy-all.js`

### 4.1 减少初始流动性

| 合约 | 修改前 | 修改后 |
|------|--------|--------|
| MockDEX A（Sepolia） | 0.1 ETH | 0.05 ETH |
| MockDEX B（Base Sepolia） | 0.1 ETH | 0.05 ETH |

### 4.2 新增：ArbitrageExecutor 资金注入

**问题：** 部署脚本未为 ArbitrageExecutor 注入 ETH，套利演示时 Executor 无 ETH 可用。

**新增步骤（步骤 4b）：**
```js
const fundTx = await destinationWallet.sendTransaction({
    to: deployments.ARBITRAGE_EXECUTOR_ADDRESS,
    value: ethers.parseEther("0.02"),
});
await fundTx.wait();
```

---

## 五、scripts/tasks/demo-liquidation.js

**文件路径：** `scripts/tasks/demo-liquidation.js`

| 参数 | 修改前 | 修改后 | 说明 |
|------|--------|--------|------|
| 存款金额 | 0.5 ETH | 0.05 ETH | HF 计算仍满足触发条件 |
| 借款金额 | 1000 USDC | 100 USDC | 与 0.05 ETH 抵押品匹配，初始 HF=1.2 |

**HF 验算（降价至 $2400 后）：**
```
HF = 0.05 ETH × $2400 × 80% / $100 = 0.96 < 1.02  ✓ 触发清算
HF = 0.96 < 1.00  ✓ 清算合法
```

---

## 六、scripts/tasks/demo-arbitrage.js

**文件路径：** `scripts/tasks/demo-arbitrage.js`

| 参数 | 修改前 | 修改后 |
|------|--------|--------|
| Swap 金额 | 0.1 ETH | 0.01 ETH |

MockDEX A 有 0.05 ETH 流动性，兑换 0.01 ETH → 30 USDC，储备充足。

---

## 七、WORKFLOW.md

**文件路径：** `WORKFLOW.md`

| 位置 | 问题 | 修复内容 |
|------|------|----------|
| 步骤 3.4 数据解析 | 描述为 `abi.decode(..., (address,address,address,uint256,uint256,uint256))` | 更正为 `abi.decode(log.data, (uint256,uint256,uint256))`（indexed 字段在 topics 不在 data） |
| 步骤 3.4 条件判断 | 缺少 Gas 检查和方向判断描述 | 新增步骤 5（Gas 检查）和步骤 6（方向判断）的代码示例 |
| 步骤 3.6 执行逻辑 | 引用不存在的 `_simulateArbitrage()` 函数 | 更正为实际代码：`IDEX(dexB).swapETHForUSDC()` + `totalProfit += minProfit` |
| 步骤 2.1 金额 | 0.5 ETH / 1000 USDC | 同步更新为 0.05 ETH / 100 USDC |

---

## 测试资金节省对比

| 操作 | 修改前 | 修改后 | 节省 |
|------|--------|--------|------|
| MockDEX A 初始流动性（Sepolia） | 0.1 ETH | 0.05 ETH | -0.05 |
| MockDEX B 初始流动性（Base Sepolia） | 0.1 ETH | 0.05 ETH | -0.05 |
| ArbitrageExecutor 注资（Base Sepolia） | 无 | 0.02 ETH | +0.02 |
| 清算演示存款（Sepolia） | 0.5 ETH | 0.05 ETH | -0.45 |
| 套利演示 Swap（Sepolia） | 0.1 ETH | 0.01 ETH | -0.09 |
| **合计** | **0.8 ETH** | **~0.18 ETH** | **节省约 0.62 ETH** |

---

**修改日期：** 2026-03-26
**项目：** Reactive DeFi Bot
