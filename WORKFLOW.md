# 部署后工作流说明

本文档详细描述了 Reactive DeFi Bot 项目部署后的完整运行逻辑。

---

## 系统架构回顾

```
┌─────────────────────────────────────────────────────────────┐
│                    Origin 链（Sepolia）                      │
│  ┌──────────────┐              ┌──────────────┐            │
│  │ MockLending  │              │  MockDEX A   │            │
│  │  (清算源)     │              │  (套利源)     │            │
│  └──────┬───────┘              └──────┬───────┘            │
│         │ emit HealthFactorUpdated    │ emit Swap          │
└─────────┼─────────────────────────────┼────────────────────┘
          │                             │
          ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Reactive Network（监听 + 判断）                 │
│                  ┌──────────────────┐                       │
│                  │  RC Controller   │                       │
│                  │  - 监听事件       │                       │
│                  │  - 判断条件       │                       │
│                  │  - 触发执行       │                       │
│                  └────────┬─────────┘                       │
└───────────────────────────┼─────────────────────────────────┘
                            │ 跨链调用
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Destination 链（Base Sepolia）                  │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │ Liquidation      │    │ Arbitrage        │              │
│  │ Executor         │    │ Executor         │              │
│  │ (执行清算)        │    │ (执行套利)        │              │
│  └──────────────────┘    └──────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

---

## 部署后的完整运行逻辑

### 阶段 1：初始化部署

#### 步骤 1.1：部署 Origin 链合约

**命令：**
```bash
MODE=mock npx hardhat run scripts/deploy/deploy-all.js
```

**执行流程：**

1. **部署 MockLending 合约**
   - 网络：Sepolia
   - 功能：模拟借贷协议
   - 关键事件：`HealthFactorUpdated(address,uint256,uint256,uint256)`
   - 参数：无构造函数参数

2. **部署 MockDEX 合约（Origin）**
   - 网络：Sepolia
   - 功能：模拟 DEX，用于触发套利
   - 关键事件：`Swap(address,address,address,uint256,uint256,uint256)`
   - 参数：初始流动性 0.1 ETH

**输出：**
- MockLending 地址：`0x...`
- MockDEX A 地址：`0x...`

---

#### 步骤 1.2：部署 Destination 链合约

**执行流程：**

1. **部署 MockDEX 合约（Destination）**
   - 网络：Base Sepolia
   - 功能：模拟 DEX，用于制造价差
   - 参数：初始流动性 0.1 ETH

2. **部署 LiquidationExecutor 合约**
   - 网络：Base Sepolia
   - 功能：执行清算操作
   - 参数：
     - RCController 地址：临时使用 `0x000...000`（零地址）
     - Vault 地址：临时使用 `0x000...000`（零地址）

3. **部署 ArbitrageExecutor 合约**
   - 网络：Base Sepolia
   - 功能：执行套利操作
   - 参数：
     - RCController 地址：临时使用 `0x000...000`（零地址）
     - Vault 地址：临时使用 `0x000...000`（零地址）

**输出：**
- MockDEX B 地址：`0x...`
- LiquidationExecutor 地址：`0x...`
- ArbitrageExecutor 地址：`0x...`

---

#### 步骤 1.3：部署 Reactive Network 合约

**执行流程：**

1. **部署 RCController 合约**
   - 网络：Reactive Network Testnet
   - 功能：监听事件、判断条件、触发执行
   - 参数：
     - Origin 链配置：
       - Chain ID: 11155111
       - MockLending 地址：`0x...`
       - MockDEX A 地址：`0x...`
     - Destination 链配置：
       - Chain ID: 84532
       - LiquidationExecutor 地址：`0x...`
       - ArbitrageExecutor 地址：`0x...`
       - MockDEX B 地址：`0x...`
     - 策略参数：
       - 健康度阈值：1.02
       - 套利价差阈值：1.5%

2. **自动订阅事件**
   - 订阅 MockLending 的 `HealthFactorUpdated` 事件
   - 订阅 MockDEX A 的 `Swap` 事件

**输出：**
- RCController 地址：`0x...`

---

#### 步骤 1.4：更新 Executor 配置

**执行流程：**

1. **切换到 Base Sepolia 网络**

2. **更新 LiquidationExecutor 的 RCController 地址**
   - 调用：`updateRCController(rcControllerAddress)`
   - 结果：LiquidationExecutor 现在只接受来自 RCController 的调用

3. **更新 ArbitrageExecutor 的 RCController 地址**
   - 调用：`updateRCController(rcControllerAddress)`
   - 结果：ArbitrageExecutor 现在只接受来自 RCController 的调用

**输出：**
- 配置更新成功

---

### 阶段 2：清算工作流

#### 步骤 2.1：触发清算场景

**命令：**
```bash
npx hardhat run scripts/tasks/demo-liquidation.js --network sepolia
```

**执行流程：**

1. **用户存入抵押品**
   - 操作：调用 `MockLending.deposit()`
   - 参数：0.5 ETH
   - 事件：`HealthFactorUpdated(address user, uint256 healthFactor, uint256 totalCollateral, uint256 totalDebt)`
   - 交易哈希：`0x...`

2. **用户借款**
   - 操作：调用 `MockLending.borrow(1000e6)`
   - 参数：1000 USDC
   - 事件：`HealthFactorUpdated(...)`
   - 交易哈希：`0x...`

3. **降低 ETH 价格（模拟市场波动）**
   - 操作：调用 `MockLending.setEthPrice(2400e18)`
   - 参数：ETH 价格从 3000 → 2400
   - 事件：`HealthFactorUpdated(...)`
   - 交易哈希：`0x...`

---

#### 步骤 2.2：RC Controller 监听事件

**执行流程：**

1. **Reactive Network 捕获事件**
   - 事件：`HealthFactorUpdated(address user, uint256 healthFactor, uint256 totalCollateral, uint256 totalDebt)`
   - 来源：Sepolia 链的 MockLending 合约

2. **调用 RCController.react()**
   - 参数：`LogRecord` 包含事件数据
   - 修饰符：`vmOnly`（仅 Reactive VM 可调用）

3. **判断事件来源**
   ```solidity
   if (log._contract == mockLending) {
       _handleHealthFactorUpdate(log);
   }
   ```

---

#### 步骤 2.3：判断清算条件

**执行流程：**

1. **解析事件数据**
   ```solidity
   address user = address(uint160(log.topic_1));
   (uint256 healthFactor, uint256 totalCollateral, uint256 totalDebt) =
       abi.decode(log.data, (uint256, uint256, uint256));
   ```

2. **检查健康度阈值**
   ```solidity
   if (healthFactor >= liquidationHealthFactorThreshold) {
       return; // 健康度正常，不触发
   }
   ```
   - 阈值：1.02
   - 当前健康度：0.96
   - 结果：**触发清算**

3. **触发事件**
   ```solidity
   emit LiquidationTriggered(user, healthFactor, totalDebt);
   ```

---

#### 步骤 2.4：跨链调用 Destination 链

**执行流程：**

1. **构造跨链调用数据**
   ```solidity
   bytes memory payload = abi.encodeWithSignature(
       "executeLiquidation(uint256,address,address,uint256)",
       SEPOLIA_CHAIN_ID,
       mockLending,
       user,
       totalDebt
   );
   ```

2. **发送 Callback 事件**
   ```solidity
   emit Callback(
       BASE_SEPOLIA_CHAIN_ID,
       liquidationExecutor,
       CALLBACK_GAS_LIMIT,
       payload
   );
   ```

3. **Reactive Network 处理跨链调用**
   - 解析 Callback 事件
   - 跨链调用 Destination 链的 LiquidationExecutor

---

#### 步骤 2.5：执行清算

**执行流程：**

1. **LiquidationExecutor 接收调用**
   ```solidity
   function executeLiquidation(
       uint256 targetChain,
       address targetContract,
       address targetUser,
       uint256 debtAmount
   ) external onlyRC returns (bool success)
   ```

2. **验证调用者**
   ```solidity
   require(msg.sender == rcController, "Only RC Controller");
   ```

3. **模拟执行清算**
   ```solidity
   uint256 profit = (debtAmount * 5) / 100; // 5% 清算奖励
   totalProfit += profit;
   executionCount++;
   ```

4. **触发事件**
   ```solidity
   emit LiquidationExecuted(targetUser, debtAmount, profit, msg.sender);
   ```

5. **返回成功**
   ```solidity
   return true;
   ```

---

#### 步骤 2.6：清算完成

**结果：**
- 用户仓位被清算
- 清算人获得 5% 奖励
- 交易记录到区块链

---

### 阶段 3：套利工作流

#### 步骤 3.1：触发套利场景

**命令：**
```bash
npx hardhat run scripts/tasks/demo-arbitrage.js --network sepolia
```

**执行流程：**

1. **设置 Origin 链 DEX 价格**
   - 网络：Sepolia
   - 操作：`MockDEX A.setPrice(3000e6)`
   - 价格：3000 USDC/ETH

2. **设置 Destination 链 DEX 价格**
   - 网络：Base Sepolia
   - 操作：`MockDEX B.setPrice(3050e6)`
   - 价格：3050 USDC/ETH

3. **计算价差**
   - 价差 = (3050 - 3000) / 3000 = 1.67%
   - 阈值：1.5%
   - 结果：**满足套利条件**

---

#### 步骤 3.2：在 Origin 链执行 Swap

**执行流程：**

1. **用户在 Origin 链执行 Swap**
   - 操作：`MockDEX A.swapETHForUSDC()`
   - 参数：0.1 ETH
   - 事件：`Swap(address user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 newPrice)`
   - 交易哈希：`0x...`

---

#### 步骤 3.3：RC Controller 监听事件

**执行流程：**

1. **Reactive Network 捕获事件**
   - 事件：`Swap(...)`
   - 来源：Sepolia 链的 MockDEX A 合约

2. **调用 RCController.react()**
   ```solidity
   if (log._contract == mockDexA) {
       _handleSwapEvent(log);
   }
   ```

---

#### 步骤 3.4：判断套利条件

**执行流程：**

1. **解析事件数据**
   ```solidity
   (, , , , , uint256 newPrice) = abi.decode(
       log.data,
       (address, address, address, uint256, uint256, uint256)
   );
   ```

2. **获取 Destination 链价格**
   - MockDEX B 价格：3050 USDC/ETH（固定）

3. **计算价差**
   ```solidity
   uint256 spreadPct = _calculateSpread(newPrice, priceB);
   ```

4. **检查价差阈值**
   ```solidity
   if (spreadPct < arbitrageSpreadThreshold) {
       return; // 价差不足，不触发
   }
   ```
   - 当前价差：1.67%
   - 阈值：1.5%
   - 结果：**触发套利**

5. **触发事件**
   ```solidity
   emit ArbitrageTriggered(newPrice, priceB, spreadPct);
   ```

---

#### 步骤 3.5：跨链调用 Destination 链

**执行流程：**

1. **构造跨链调用数据**
   ```solidity
   bytes memory payload = abi.encodeWithSignature(
       "executeArbitrage(address,address,address,address,uint256,uint256)",
       mockDexA,
       address(0), // Destination DEX
       address(0), // tokenIn
       address(0), // tokenOut
       1e18,       // amountIn
       0           // minProfit
   );
   ```

2. **发送 Callback 事件**
   ```solidity
   emit Callback(
       BASE_SEPOLIA_CHAIN_ID,
       arbitrageExecutor,
       CALLBACK_GAS_LIMIT,
       payload
   );
   ```

3. **Reactive Network 处理跨链调用**
   - 解析 Callback 事件
   - 跨链调用 Destination 链的 ArbitrageExecutor

---

#### 步骤 3.6：执行套利

**执行流程：**

1. **ArbitrageExecutor 接收调用**
   ```solidity
   function executeArbitrage(
       address dexA,
       address dexB,
       address tokenIn,
       address tokenOut,
       uint256 amountIn,
       uint256 minProfit
   ) external onlyRC returns (bool success)
   ```

2. **验证调用者**
   ```solidity
   require(msg.sender == rcController, "Only RC Controller");
   ```

3. **模拟执行套利**
   ```solidity
   uint256 profit = _simulateArbitrage(amountIn);
   // 模拟 1.5% 价差套利
   return (amountIn * 15) / 1000;
   ```

4. **检查利润**
   ```solidity
   if (profit < minProfit) {
       emit ExecutionFailed(dexA, dexB, "Profit below threshold");
       return false;
   }
   ```

5. **更新状态**
   ```solidity
   totalProfit += profit;
   executionCount++;
   ```

6. **触发事件**
   ```solidity
   emit ArbitrageExecuted(tokenIn, tokenOut, amountIn, profit, msg.sender);
   ```

7. **返回成功**
   ```solidity
   return true;
   ```

---

#### 步骤 3.7：套利完成

**结果：**
- 在两个 DEX 之间执行反向交易
- 获得套利利润
- 交易记录到区块链

---

### 阶段 4：持续运行

#### 自动化运行逻辑

部署完成后，系统会自动持续运行：

1. **持续监听**
   - RCController 始终监听 Origin 链的事件
   - 无需任何外部干预

2. **自动判断**
   - 每次事件触发时自动判断条件
   - 满足条件时自动执行

3. **自动执行**
   - 跨链调用 Destination 链
   - 执行清算或套利操作

4. **24/7 运行**
   - 部署在 Reactive Network 上
   - 由 Reactive Network 维护
   - 无需服务器，无需人工干预

---

## 关键时序图

### 清算流程时序

```
用户        MockLending        Reactive Network    LiquidationExecutor
  │              │                    │                    │
  ├─ deposit() ──>│                    │                    │
  │              ├─ emit HFUpdated ──>│                    │
  │              │                    ├─ react()          │
  │              │                    ├─ check condition  │
  │              │                    ├─ emit Callback ──>│
  │              │                    │                    ├─ execute()
  │              │                    │                    ├─ emit Executed
  │              │                    │                    │
```

### 套利流程时序

```
用户        MockDEX A         Reactive Network    ArbitrageExecutor
  │              │                    │                    │
  ├─ swap() ─────>│                    │                    │
  │              ├─ emit Swap ──────>│                    │
  │              │                    ├─ react()          │
  │              │                    ├─ check spread     │
  │              │                    ├─ emit Callback ──>│
  │              │                    │                    ├─ execute()
  │              │                    │                    ├─ emit Executed
  │              │                    │                    │
```

---

## 监控和维护

### 查询合约状态

```bash
# 查询 RCController 状态
npx hardhat console --network reactive
> const rc = await ethers.getContractAt("RCController", "0x...")
> await rc.liquidationHealthFactorThreshold()
> await rc.arbitrageSpreadThreshold()
> await rc.paused()
```

### 查询 Executor 统计

```bash
# 查询 LiquidationExecutor 统计
npx hardhat console --network base-sepolia
> const liq = await ethers.getContractAt("LiquidationExecutor", "0x...")
> await liq.totalProfit()
> await liq.executionCount()
```

### 暂停/恢复策略

```bash
# 暂停策略（RCController owner 调用）
> await rc.pause()

# 恢复策略
> await rc.unpause()
```

---

## 故障排查

### 问题 1：事件未被监听

**可能原因：**
- 订阅失败
- 合约地址配置错误
- 事件签名不匹配

**解决方案：**
```bash
# 检查订阅状态
npx hardhat console --network reactive
> const rc = await ethers.getContractAt("RCController", "0x...")
> # 检查 Subscribed 事件
```

### 问题 2：跨链调用失败

**可能原因：**
- Gas Limit 不足
- Executor 地址配置错误
- 权限验证失败

**解决方案：**
- 增加 CALLBACK_GAS_LIMIT
- 检查 Executor 的 RCController 地址配置
- 验证权限设置

---

## 总结

部署后的工作流可以总结为：

1. **部署阶段**：部署所有合约并配置参数
2. **监听阶段**：RCController 持续监听 Origin 链事件
3. **判断阶段**：自动判断是否满足清算或套利条件
4. **执行阶段**：跨链调用 Destination 链执行操作
5. **运行阶段**：24/7 自动化运行，无需人工干预

**关键优势：**
- ✅ 零延迟事件监听
- ✅ 自动化判断和执行
- ✅ 跨链原生支持
- ✅ 无需服务器，低成本
- ✅ 24/7 持续运行

---

**项目**: Reactive DeFi Bot
**版本**: v1.0.0
**更新时间**: 2026-03-25