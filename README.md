# Reactive DeFi Bot

基于 Reactive Network 的跨链 DeFi 自动化示例，包含：

- 清算场景：监听 `MockLending` 的健康度变化并触发清算
- 套利场景：监听 `MockDEX` 的价格变化并触发套利
- Reactive 控制器：`RCController`
- 目标链执行器：`LiquidationExecutor`、`ArbitrageExecutor`

## 当前状态

- `npx hardhat compile` 通过
- `npx hardhat test` 通过
- 当前单元测试结果：`33 passing`

## 目录结构

```text
contracts/
  mocks/
    MockLending.sol
    MockDEX.sol
  destination/
    LiquidationExecutor.sol
    ArbitrageExecutor.sol
  reactive/
    RCController.sol

scripts/
  deploy/
    deploy-all.js
  tasks/
    demo-liquidation.js
    demo-arbitrage.js

config/
  index.js

docs/
  ENV_SETUP.md
```

## 环境要求

- Node.js 24
- npm

安装依赖：

```bash
npm install
```

## 环境变量

先复制模板：

```bash
cp .env.example .env
```

至少需要配置：

- `PRIVATE_KEY`
- `SEPOLIA_RPC_URL`
- `BASE_SEPOLIA_RPC_URL`
- `REACTIVE_RPC_URL`

如果你还要运行带 `--network sepolia`、`--network base_sepolia`、`--network lasna` 的 Hardhat 命令，还需要保证：

- `SEPOLIA_URL`
- `WALLET_KEY1`

详细说明见 [docs/ENV_SETUP.md](/e:/reactive_contract_defi/reactive_DeFi_bot/docs/ENV_SETUP.md)。

## 本地测试

```bash
npx hardhat test
```

## 部署

当前部署脚本会直接使用 `.env` 里的 RPC 和私钥，不依赖 `hre.changeNetwork()`。

```bash
MODE=mock npx hardhat run scripts/deploy/deploy-all.js
```

部署完成后会自动回填：

- `MOCK_LENDING_ADDRESS`
- `MOCK_DEX_A_ADDRESS`
- `MOCK_DEX_B_ADDRESS`
- `LIQUIDATION_EXECUTOR_ADDRESS`
- `ARBITRAGE_EXECUTOR_ADDRESS`
- `RC_CONTROLLER_ADDRESS`

## 演示脚本

清算演示：

```bash
npx hardhat run scripts/tasks/demo-liquidation.js --network sepolia
```

套利演示：

```bash
npx hardhat run scripts/tasks/demo-arbitrage.js
```

说明：

- `demo-liquidation.js` 仍通过 Hardhat 的 `sepolia` network 读取 signer 和合约
- `demo-arbitrage.js` 已改为直接使用 `.env` 中的多链 RPC
- 当前 `hardhat.config.js` 里 Reactive Network 的名字是 `lasna`

## 网络命名说明

当前项目中的链语义是：

- `sepolia`：Origin 链
- `base_sepolia`：Destination 链
- `lasna`：Reactive Network

注意：

- `lasna` 就是当前项目里使用的 Reactive 网络名
- 如果你执行 Hardhat 命令，网络名请以 `hardhat.config.js` 为准

## 合约验证

Sepolia：

```bash
npx hardhat verify --network sepolia <合约地址> <构造参数>
```

Base Sepolia：

```bash
npx hardhat verify --network base_sepolia <合约地址> <构造参数>
```

## 说明

- `RCController.sol` 里的事件 topic 已与当前事件签名对齐
- 执行器合约已将“模拟利润统计”和“真实可提余额”分开处理
- `test/run-local-tests.js` 现在不会再污染 `npx hardhat test`

## 参考

- [Reactive Network 文档](https://dev.reactive.network/)
- [Reactive Network 示例](https://github.com/Reactive-Network/reactive-smart-contract-demos)
- [Hardhat 文档](https://hardhat.org/docs)
