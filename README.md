# Reactive DeFi Bot

基于 Reactive Network 的跨链 DeFi 自动化系统，当前仓库同时包含两条路线：

- 推荐路线：面向前端用户流的 `UserVault + RCFactory + UserRC`
- 旧路线：早期比赛 / 演示使用的 `RCController + Executors`

这两条路线现在共存在一个仓库里，但推荐你优先使用“用户独立 Vault + RC”这套新流程，尤其是本地开发和前端联调。

## 📋 当前状态

- 前端目录在 `frontend/`
- 推荐的本地开发组合是 `APP_ENV=local + PROTOCOL_MODE=mock`
- 本地 mock 流已经可以跑通：`MockLending`、`MockDEX`、`UserVault`、`RCFactory`
- `deploy:user-flow` 会自动把地址同步到 `frontend/.env.local`
- `PROTOCOL_MODE=prod` 已支持真实协议执行（Aave V3 清算 + Uniswap V3 套利），部署脚本会自动配置 SwapRouter/WETH/USDC
- 事件 topic 可配置：mock 模式用 MockLending/MockDEX 事件签名，prod 模式用 Aave V3 LiquidationCall / Uniswap V3 Swap
- 本地开发时会自动注入 `MockReactiveService` 到 `0xfffFfF`，解决 `service.subscribe()` 在 Hardhat 上的调用问题
- 旧的 `deploy-all.js`、`demo-liquidation.js`、`demo-arbitrage.js` 仍然保留，但它们属于 legacy demo，不是当前前端主流程

## 🏗️ 推荐架构

### 用户流

```text
Mock 模式:
  MockLending / MockDEX (Origin 事件源)
              ↓
        UserRC (Reactive Network)
              ↓
   UserVault (Destination 模拟结算)

Prod 模式:
  Aave V3 / Uniswap V3 (Origin 真实事件)
              ↓
        UserRC (Reactive Network)
              ↓
   UserVault (Destination → Uniswap V3 真实执行)
              ↓
          Frontend
```

这套流里：

- 用户资金和策略状态存放在 `UserVault`
- 每个用户通过 `RCFactory` 部署自己的 `UserRC`
- `UserRC` 负责监听事件并回调 `UserVault`
- 前端主要围绕 `UserVault` 和 `RCFactory` 交互

### 本地开发时的特殊说明

在 `APP_ENV=local` 下，Origin / Destination / Reactive 这三条”逻辑链”都会映射到同一个本地 Hardhat 节点 `http://127.0.0.1:8545`。
也就是说，本地调试时虽然代码里保留了跨链概念，但底层实际跑在同一条本地链上。

部署脚本会自动通过 `hardhat_setCode` 在 `0xfffFfF` 注入 `MockReactiveService`，使 `UserRC` 构造函数中的 `service.subscribe()` 调用不会 revert。

## 🚀 快速开始

### 1. 安装依赖

```bash
nvm use 24
npm install
npm install --prefix frontend
```

### 2. 准备环境变量

```bash
cp .env.example .env
```

推荐本地开发配置：

```env
APP_ENV=local
PROTOCOL_MODE=mock
MODE=mock
LOCAL_RPC_URL=http://127.0.0.1:8545
```

说明：

- `APP_ENV` 决定你连本地、测试网还是主网
- `PROTOCOL_MODE` 决定你走 mock 协议还是真实协议逻辑
- `MODE` 目前只是兼容旧脚本，建议以后主要看 `APP_ENV` 和 `PROTOCOL_MODE`

### 3. 启动本地链

```bash
npm run local:node
```

这条命令要一直保持运行。  
本地默认使用 Hardhat 提供的测试账户，不需要真实测试网私钥。

### 4. 部署本地用户流合约

新开一个终端执行：

```bash
npm run deploy:user-flow
```

这条命令会：

- 部署或复用 `MockLending`
- 部署或复用 `MockDEX`
- 部署 `UserVault`
- 部署 `RCFactory`
- 回写根目录 `.env`
- 自动生成 `frontend/.env.local`

### 5. 启动前端

```bash
npm run frontend:dev
```

前端默认地址：

```text
http://127.0.0.1:3000
```

### 6. 钱包连接

如果你要在前端里实际点击存款、部署 RC、更新策略，钱包需要连接到本地链：

- RPC: `http://127.0.0.1:8545`
- Chain ID: `31337`
- 可导入 Hardhat 默认账户 0：

```text
Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

只可用于本地开发，绝对不要用于任何真实网络。

## ⚙️ 环境组合

推荐理解方式是把“网络环境”和“协议逻辑”分开看：

- `APP_ENV=local` + `PROTOCOL_MODE=mock`
说明：纯本地开发，推荐默认组合

- `APP_ENV=testnet` + `PROTOCOL_MODE=mock`
说明：测试网上跑 mock 协议演示

- `APP_ENV=testnet` + `PROTOCOL_MODE=prod`
说明：测试网下真实协议执行（Aave V3 + Uniswap V3），需配置 `UNISWAP_POOL_SEPOLIA`

- `APP_ENV=mainnet` + `PROTOCOL_MODE=prod`
说明：真实环境，需配置 `UNISWAP_POOL_MAINNET`

目前需要特别注意：

- `deploy:user-flow` 同时支持 `mock` 和 `prod` 两种协议模式
- `prod` 模式下部署脚本会自动调用 `setProtocolConfig` 配置 Uniswap V3 SwapRouter/WETH/USDC
- 非 `local` 环境下需要填写真实 `PRIVATE_KEY` 和对应 RPC
- `prod` 模式需要在 `.env` 中配置 Origin 链上要监听的合约地址（`UNISWAP_POOL_SEPOLIA` 或 `UNISWAP_POOL_MAINNET`）

## 🔧 常用命令

```bash
# 编译
npm run compile

# 测试
npm test

# 启动本地链
npm run local:node

# 部署前端用户流
npm run deploy:user-flow

# 同步前端环境变量
npm run sync:frontend-env

# 启动前端
npm run frontend:dev

# 构建前端
npm run frontend:build

# 前端 lint
npm run frontend:lint
```

## 📁 项目结构

```text
reactive/
├── contracts/
│   ├── interfaces/
│   │   ├── IAaveV3Pool.sol
│   │   ├── IERC20.sol
│   │   ├── ISwapRouter.sol
│   │   └── IWETH.sol
│   ├── mocks/
│   │   ├── MockDEX.sol
│   │   ├── MockLending.sol
│   │   └── MockReactiveService.sol
│   ├── destination/
│   │   ├── ArbitrageExecutor.sol
│   │   ├── LiquidationExecutor.sol
│   │   └── UserVault.sol
│   └── reactive/
│       ├── RCController.sol
│       ├── RCFactory.sol
│       └── UserRC.sol
├── config/
│   └── index.js
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
├── scripts/
│   ├── deploy/
│   │   ├── deploy-all.js
│   │   ├── deploy-user-flow.js
│   │   └── inject-mock-service.js
│   ├── sync-frontend-env.js
│   └── tasks/
├── test/
├── hardhat.config.js
├── .env.example
└── README.md
```

## 🧭 两条路线的区别

### 推荐路线

文件核心：

- `contracts/destination/UserVault.sol`
- `contracts/reactive/RCFactory.sol`
- `contracts/reactive/UserRC.sol`
- `frontend/`
- `scripts/deploy/deploy-user-flow.js`

适用场景：

- 本地联调
- 前端交互
- 用户独立仓位 / 独立 RC 流程

### Legacy 路线

文件核心：

- `contracts/reactive/RCController.sol`
- `contracts/destination/LiquidationExecutor.sol`
- `contracts/destination/ArbitrageExecutor.sol`
- `scripts/deploy/deploy-all.js`
- `scripts/tasks/demo-liquidation.js`
- `scripts/tasks/demo-arbitrage.js`

适用场景：

- 旧的比赛演示
- 旧的测试网脚本

注意：

- 这套路线目前不是前端主流程
- README 里不再把它当作默认入口
- 如果你只是想把前端跑起来，不需要先碰这套 legacy demo

## 🧪 当前推荐调试顺序

如果你现在只是想验证“本地链 + 前端 + 用户流”是否正常，推荐顺序：

1. `cp .env.example .env`
2. 把 `.env` 设成 `APP_ENV=local`、`PROTOCOL_MODE=mock`
3. `npm run local:node`
4. `npm run deploy:user-flow`
5. `npm run frontend:dev`
6. 钱包切到本地链 `31337`
7. 在前端里测试存款、部署 RC、同步 RC、更新策略

## ⚠️ 注意事项

- 不要把 `.env` 提交到 git
- 本地 Hardhat 账户只可用于本地调试
- `frontend/.env.local` 是部署脚本自动生成的，不建议手改
- 目前 `prod` 模式支持 Uniswap V3 双向 swap 执行，Aave V3 直接清算执行为预留接口（`IAaveV3Pool`），后续可扩展

## 📚 参考

- [Reactive Network 官方文档](https://dev.reactive.network/)
- [Reactive Network 示例代码](https://github.com/Reactive-Network/reactive-smart-contract-demos)
- [Hardhat 文档](https://hardhat.org/docs)

## 📝 License

MIT
