# 环境配置指南

本文档对应当前仓库代码，重点说明 `.env` 中哪些变量给哪些脚本使用。

## 一、必须配置的变量

### 1. `PRIVATE_KEY`

部署脚本和新的多链演示脚本优先使用这个变量。

格式示例：

```bash
PRIVATE_KEY=0x你的64位十六进制私钥
```

建议：

- 只使用测试网私钥
- 不要使用主网大额账户私钥
- 不要把真实私钥提交到 Git

### 2. `SEPOLIA_RPC_URL`

部署脚本和配置文件读取的 Sepolia RPC。

可用示例：

```bash
SEPOLIA_RPC_URL=https://rpc.sepolia.org
```

或：

```bash
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/你的PROJECT_ID
```

### 3. `BASE_SEPOLIA_RPC_URL`

部署脚本和套利演示脚本读取的 Base Sepolia RPC。

可用示例：

```bash
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

### 4. `REACTIVE_RPC_URL`

Reactive Network RPC，当前项目按 `lasna` 语义使用。

默认示例：

```bash
REACTIVE_RPC_URL=https://lasna-rpc.rnk.dev/
```

## 二、Hardhat 兼容变量

当前 `hardhat.config.js` 仍会读取旧命名，因此如果你要运行带 `--network ...` 的 Hardhat 命令，建议同时配置下面这组：

### 1. `SEPOLIA_URL`

```bash
SEPOLIA_URL=https://rpc.sepolia.org
```

### 2. `WALLET_KEY1`

```bash
WALLET_KEY1=0x你的64位十六进制私钥
```

### 3. `WALLET_KEY2`

第二个账户，可留空：

```bash
WALLET_KEY2=
```

### 4. `API_KEY`

当前 `hardhat.config.js` 的验证配置读取的是这个变量。

```bash
API_KEY=你的API_KEY
```

## 三、可选变量

### 1. `ETHERSCAN_API_KEY`

```bash
ETHERSCAN_API_KEY=你的API_KEY
```

### 2. `BASESCAN_API_KEY`

```bash
BASESCAN_API_KEY=你的API_KEY
```

### 3. 已部署地址

这些变量通常不需要手填，运行部署脚本后会自动回填：

```bash
MOCK_LENDING_ADDRESS=
MOCK_DEX_A_ADDRESS=
MOCK_DEX_B_ADDRESS=
LIQUIDATION_EXECUTOR_ADDRESS=
ARBITRAGE_EXECUTOR_ADDRESS=
RC_CONTROLLER_ADDRESS=
```

## 四、推荐模板

```bash
MODE=mock

PRIVATE_KEY=0x你的私钥

SEPOLIA_RPC_URL=https://rpc.sepolia.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
REACTIVE_RPC_URL=https://lasna-rpc.rnk.dev/

SEPOLIA_URL=https://rpc.sepolia.org
WALLET_KEY1=0x你的私钥
WALLET_KEY2=

ETHERSCAN_API_KEY=
BASESCAN_API_KEY=
API_KEY=

MOCK_LENDING_ADDRESS=
MOCK_DEX_A_ADDRESS=
MOCK_DEX_B_ADDRESS=
LIQUIDATION_EXECUTOR_ADDRESS=
ARBITRAGE_EXECUTOR_ADDRESS=
RC_CONTROLLER_ADDRESS=
```

## 五、命令对应关系

### 1. 本地测试

```bash
npx hardhat test
```

### 2. 部署

部署脚本会直接读取 `.env` 中的 RPC 和私钥：

```bash
MODE=mock npx hardhat run scripts/deploy/deploy-all.js
```

### 3. 清算演示

这个脚本仍依赖 Hardhat 的 `sepolia` network：

```bash
npx hardhat run scripts/tasks/demo-liquidation.js --network sepolia
```

### 4. 套利演示

这个脚本已改为直接使用 `.env` 里的多链 RPC：

```bash
npx hardhat run scripts/tasks/demo-arbitrage.js
```

### 5. 合约验证

```bash
npx hardhat verify --network sepolia <合约地址> <构造参数>
npx hardhat verify --network base_sepolia <合约地址> <构造参数>
```

## 六、注意事项

- `lasna` 就是当前项目里使用的 Reactive 网络名
- `base_sepolia` 是当前 `hardhat.config.js` 中的 Base Sepolia 网络名
- 文档里不再使用不存在的 `scripts/check-balance.js`
- `.env` 已被 `.gitignore` 忽略，但仍然不要把私钥泄露给他人
