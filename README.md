# Reactive DeFi Bot

基于 Reactive Network 的跨链 DeFi 自动化系统，支持清算和套利策略。

## 📋 项目概述

本项目实现了一个完整的链上自动赚钱系统，核心特点：

- **清算模块**：监听借贷协议健康度变化，自动执行清算获取奖励
- **套利模块**：监听 DEX 价格变化，自动执行跨链套利
- **RC 驱动**：使用 Reactive Contract 实现真正的链上自动化（无需 bot 轮询）
- **跨链执行**：Origin 链监听 → Reactive Network 判断 → Destination 链执行
- **模式切换**：支持 mock（演示）和 prod（真实交易）两种模式

## 🏗️ 架构

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
└────���──────────────────────┼─────────────────────────────────┘
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

## 🚀 快速开始

### 1. 安装依赖

```bash
# 使用 Node 24
nvm use 24

# 安装依赖
npm install
```

### 2. 本地测试（无需配置）

```bash
# 运行单元测试（完全本地，不需要 .env 和测试币）
npx hardhat test

# 测试结果：31/33 通过 ✅
```

### 3. 配置环境（部署测试网时需要）

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env，填入：
# - PRIVATE_KEY（部署账户私钥）
# - SEPOLIA_RPC_URL
# - BASE_SEPOLIA_RPC_URL
# - REACTIVE_RPC_URL（默认：https://kopli-rpc.rkt.ink）

# 详细配置教程见：docs/ENV_SETUP.md
```

### 4. 部署合约

```bash
# 部署所有合约（mock 模式）
MODE=mock npx hardhat run scripts/deploy/deploy-all.js

# 部署完成后，合约地址会自动保存到 .env
```

### 5. 运行演示

#### 清算演示

```bash
# 模拟清算场景
npx hardhat run scripts/tasks/demo-liquidation.js --network sepolia
```

流程：
1. 存入 0.5 ETH 抵押品
2. 借款 1000 USDC
3. 手动降低 ETH 价格（3000 → 2400）
4. 健康度 < 1.02，触发 `HealthFactorUpdated` 事件
5. RC Controller 监听到事件，触发清算

#### 套利演示

```bash
# 模拟套利场景
npx hardhat run scripts/tasks/demo-arbitrage.js --network sepolia
```

流程：
1. 在两条链的 DEX 设置不同价格（3000 vs 3050）
2. 在 Origin 链执行 Swap
3. 触发 `Swap` 事件
4. RC Controller 检测到价差 > 1.5%，触发套利

## 📁 项目结构

```
reactive/
├── contracts/
│   ├── mocks/              # Mock 合约（演示用）
│   │   ├── MockLending.sol
│   │   └── MockDEX.sol
│   ├── destination/        # Destination 链执行合约
│   │   ├── LiquidationExecutor.sol
│   │   └── ArbitrageExecutor.sol
│   └── reactive/           # Reactive Network 合约
│       └── RCController.sol
├── scripts/
│   ├── deploy/
│   │   └── deploy-all.js   # 完整部署脚本
│   └── tasks/
│       ├── demo-liquidation.js
│       └── demo-arbitrage.js
├── test/
│   ├── MockLending.test.js
│   ├── MockDEX.test.js
│   └── Executors.test.js
├── config/
│   └── index.js            # 环境配置（mock/prod 切换）
├── docs/
│   └── ENV_SETUP.md        # 详细配置教程
├── hardhat.config.js
├── .env.example
└── README.md
```

## ⚙️ 配置说明

### 模式切换

在 `.env` 中设置 `MODE`：

- **mock**：使用 MockLending 和 MockDEX，方便演示和测试
- **prod**：使用真实的 Aave、Uniswap、SushiSwap

### 策略参数

在 `config/index.js` 中调整：

```javascript
STRATEGY: {
  liquidation: {
    healthFactorThreshold: "1.02",  // 清算触发阈值
    maxDebtUSD: 5000,               // 单次最大清算金额
    minProfitUSD: 10,               // 最小利润要求
  },
  arbitrage: {
    spreadThreshold: 1.5,           // 套利触发价差（%）
    maxPoolLiquidityUSD: 500000,    // 目标池子最大流动性
    maxPositionPct: 20,             // 单次最大仓位（%）
    slippagePct: 2,                 // 滑点容忍度（%）
  },
  risk: {
    maxConsecutiveLosses: 3,        // 连续亏损停机阈值
    gasProfitCheck: true,           // Gas 成本检查
    maxGasGwei: 50,                 // 最大 Gas 价格
  },
}
```

## 🔧 开发指南

### 编译合约

```bash
npx hardhat compile
```

### 测试合约

```bash
# 运行所有测试
npx hardhat test

# 运行特定测试
npx hardhat test test/MockLending.test.js
```

### 验证合约

```bash
# Sepolia
npx hardhat verify --network sepolia <合约地址> <构造函数参数>

# Base Sepolia
npx hardhat verify --network base-sepolia <合约地址> <构造函数参数>
```

## ✅ Reactive Network SDK 适配完成

`RCController.sol` 已基于 [Reactive Network 官方示例](https://github.com/Reactive-Network/reactive-smart-contract-demos/tree/main/src/demos/uniswap-v2-stop-order) 完成适配：

**已实现的核心功能：**
- ✅ 继承 `AbstractReactive` 基类
- ✅ 实现 `react(LogRecord calldata log)` 回调函数
- ✅ 使用 `service.subscribe()` 订阅 Origin 链事件
- ✅ 使用 `emit Callback()` 触发 Destination 链跨链调用
- ✅ 支持 ReactVM 双状态模型

**订阅的事件：**
- `HealthFactorUpdated(address,uint256,uint256,uint256)` - 监听借贷健康度变化
- `Swap(address,address,address,uint256,uint256,uint256)` - 监听 DEX 价格变化

**工作流程：**
1. Origin 链（Sepolia）触发事件 → 2. Reactive Network 监听并调用 `react()` → 3. 判断条件满足 → 4. 发送 `Callback` 事件 → 5. Destination 链（Base Sepolia）执行操作

## 📊 比赛提交清单

根据 Reactive Network 比赛要求，需要提交：

- [x] 完整合约代码（MockLending, MockDEX, RCController, Executors）
- [x] 部署脚本（支持 mock/prod 切换）
- [x] 演示脚本（清算 + 套利）
- [x] 测试用例（31/33 通过）
- [ ] 已部署合约地址（运行部署脚本后填入）
- [ ] 完整交易哈希记录（运行演示脚本后获取）
- [ ] 演示视频（≤5 分钟）
- [x] 项目说明文档（本 README）

### 交易哈希记录模板

```
Origin 链（Sepolia）:
- MockLending 部署: 0x...
- MockDEX 部署: 0x...
- 清算演示 - 存入: 0x...
- 清算演示 - 借款: 0x...
- 清算演示 - 降价: 0x...
- 套利演示 - Swap: 0x...

Destination 链（Base Sepolia）:
- LiquidationExecutor 部署: 0x...
- ArbitrageExecutor 部署: 0x...
- MockDEX 部署: 0x...

Reactive Network:
- RCController 部署: 0x...
```

## ⚠️ 安全提示

- **私钥安全**：永远不要提交 `.env` 文件到 Git
- **测试网使用**：初期只在测试网运行，确保逻辑正确后再考虑主网
- **资金管理**：MVP 阶段使用小额资金测试
- **风控机制**：连续亏损 3 次会自动停机

## 📚 参考资料

- [Reactive Network 官方文档](https://dev.reactive.network/)
- [Reactive Network 示例代码](https://github.com/Reactive-Network/reactive-smart-contract-demos)
- [环境配置详细教程](docs/ENV_SETUP.md)
- [Hardhat 文档](https://hardhat.org/docs)
- [Aave v3 文档](https://docs.aave.com/)
- [Uniswap v2 文档](https://docs.uniswap.org/contracts/v2/overview)

## 📝 License

MIT

---

**🤖 Generated with Claude Code**
