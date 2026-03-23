# .env 文件配置指南

## 📋 必填项

### 1. PRIVATE_KEY（部署账户私钥）

**获取方式：**

#### 方法 A：从 MetaMask 导出（推荐用测试账户）

1. 打开 MetaMask
2. 点击右上角三个点 → 账户详情
3. 点击"导出私钥"
4. 输入密码
5. 复制私钥（格式：`0x...`）

⚠️ **安全提示：**
- 永远不要用主账户的私钥
- 建议创建一个新的测试账户
- 只在测试网使用

#### 方法 B：生成新的测试账户

```bash
# 使用 Hardhat 生成
npx hardhat console
> const wallet = ethers.Wallet.createRandom()
> console.log("地址:", wallet.address)
> console.log("私钥:", wallet.privateKey)
```

**填入 .env：**
```bash
PRIVATE_KEY=0x你的64位十六进制私钥
```

---

### 2. RPC URLs（节点地址）

#### SEPOLIA_RPC_URL

**选项 A：Infura（推荐）**

1. 访问 https://infura.io/
2. 注册账号（免费）
3. 创建新项目
4. 复制 Sepolia 的 HTTPS 端点

```bash
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/你的PROJECT_ID
```

**选项 B：Alchemy**

1. 访问 https://www.alchemy.com/
2. 注册账号
3. 创建 App，选择 Sepolia
4. 复制 HTTPS URL

```bash
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/你的API_KEY
```

**选项 C：公共 RPC（不稳定，不推荐）**

```bash
SEPOLIA_RPC_URL=https://rpc.sepolia.org
```

#### BASE_SEPOLIA_RPC_URL

**选项 A：Alchemy（推荐）**

1. 在 Alchemy 创建 App，选择 Base Sepolia
2. 复制 HTTPS URL

```bash
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/你的API_KEY
```

**选项 B：公共 RPC**

```bash
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

#### REACTIVE_RPC_URL

**已有默认值，无需修改：**

```bash
REACTIVE_RPC_URL=https://kopli-rpc.rkt.ink
```

如果官方有其他节点，可以替换。

---

### 3. 区块浏览器 API Key（用于合约验证）

#### ETHERSCAN_API_KEY

1. 访问 https://etherscan.io/
2. 注册账号
3. 进入 https://etherscan.io/myapikey
4. 创建新的 API Key（免费）

```bash
ETHERSCAN_API_KEY=你的API_KEY
```

#### BASESCAN_API_KEY

1. 访问 https://basescan.org/
2. 注册账号
3. 进入 API Keys 页面
4. 创建新的 API Key

```bash
BASESCAN_API_KEY=你的API_KEY
```

⚠️ **注意：** 如果不需要验证合约，可以留空。

---

## 📝 完整示例

```bash
# ══════════════════════════════════════════════
# 环境模式
# ══════════════════════════════════════════════
MODE=mock

# ══════════════════════════════════════════════
# 钱包私钥（测试账户）
# ══════════════════════════════════════════════
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# ══════════════════════════════════════════════
# RPC 节点
# ══════════════════════════════════════════════
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/你的PROJECT_ID
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/你的API_KEY
REACTIVE_RPC_URL=https://kopli-rpc.rkt.ink

# ══════════════════════════════════════════════
# 区块浏览器 API Key（可选）
# ══════════════════════════════════════════════
ETHERSCAN_API_KEY=你的KEY
BASESCAN_API_KEY=你的KEY

# ══════════════════════════════════════════════
# 已部署合约地址（部署后自动填入）
# ══════════════════════════════════════════════
MOCK_LENDING_ADDRESS=
MOCK_DEX_A_ADDRESS=
MOCK_DEX_B_ADDRESS=
LIQUIDATION_EXECUTOR_ADDRESS=
ARBITRAGE_EXECUTOR_ADDRESS=
RC_CONTROLLER_ADDRESS=
```

---

## 💰 获取测试币

部署合约需要 gas，你需要在测试网获取免费的测试币。

### Sepolia ETH

**水龙头列表：**
1. https://sepoliafaucet.com/
2. https://www.alchemy.com/faucets/ethereum-sepolia
3. https://faucet.quicknode.com/ethereum/sepolia

**使用方式：**
1. 复制你的钱包地址
2. 粘贴到水龙头网站
3. 完成验证（可能需要 Twitter 或 GitHub 账号）
4. 等待几分钟，测试币会到账

### Base Sepolia ETH

**水龙头：**
1. https://www.alchemy.com/faucets/base-sepolia
2. 先在 Sepolia 领 ETH，然后通过 Base 官方桥跨链

### Reactive Network REACT

**水龙头：**
- 需要你自己搜索 "Reactive Network faucet" 或查看官方文档
- 比赛方应该会提供水龙头链接

---

## ✅ 验证配置

配置完成后，运行以下命令验证：

```bash
# 检查账户余额（Sepolia）
npx hardhat run scripts/check-balance.js --network sepolia

# 检查账户余额（Base Sepolia）
npx hardhat run scripts/check-balance.js --network base-sepolia
```

如果看到余额 > 0，说明配置成功！

---

## 🔒 安全提示

1. **永远不要提交 .env 到 Git**
   - 已经在 .gitignore 里了，但要确认

2. **不要在公共场合分享私钥**
   - 截图时注意遮挡

3. **测试网和主网分开**
   - 主网私钥永远不要用在测试环境

4. **定期轮换 API Key**
   - 如果泄露，立即重新生成

---

## ❓ 常见问题

**Q: 我没有 MetaMask，怎么办？**
A: 用方法 B 生成新账户，或者安装 MetaMask（推荐）

**Q: Infura/Alchemy 要收费吗？**
A: 免费额度足够测试使用，不需要付费

**Q: 测试币领不到怎么办？**
A: 多试几个水龙头，或者在 Discord/Telegram 社区求助

**Q: 部署失败提示 "insufficient funds"？**
A: 账户余额不足，去水龙头领更多测试币

**Q: RPC 连接超时？**
A: 换一个 RPC 提供商，或检查网络连接
