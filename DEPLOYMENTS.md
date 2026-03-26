# 已部署合约地址

本文档记录了 Reactive DeFi Bot 项目中所有已部署合约的地址，用于比赛提交验证。

## Origin 链（Sepolia）

| 合约名称 | 合约地址 | 区块浏览器 | 功能说明 |
|---------|---------|-----------|---------|
| MockLending | `0x...` | [Etherscan](https://sepolia.etherscan.io/) | 模拟借贷协议，用于演示清算场景 |
| MockDEX (Origin) | `0x...` | [Etherscan](https://sepolia.etherscan.io/) | 模拟 DEX，用于演示套利场景 |

---

## Destination 链（Base Sepolia）

| 合约名称 | 合约地址 | 区块浏览器 | 功能说明 |
|---------|---------|-----------|---------|
| MockDEX (Destination) | `0x...` | [Basescan](https://sepolia.basescan.org/) | 模拟 DEX，用于制造价差 |
| LiquidationExecutor | `0x...` | [Basescan](https://sepolia.basescan.org/) | 执行清算操作的执行合约 |
| ArbitrageExecutor | `0x...` | [Basescan](https://sepolia.basescan.org/) | 执行套利操作的执行合约 |

---

## Reactive Network

| 合约名称 | 合约地址 | 区块浏览器 | 功能说明 |
|---------|---------|-----------|---------|
| RCController | `0x...` | [Reactive Explorer](https://explorer.reactive.network/) | Reactive Contract 控制器，监听事件并触发执行 |

---

## 部署命令

```bash
# 部署所有合约（mock 模式）
MODE=mock npx hardhat run scripts/deploy/deploy-all.js
```

---

## 验证合约

### Sepolia
```bash
npx hardhat verify --network sepolia <合约地址> <构造函数参数>
```

### Base Sepolia
```bash
npx hardhat verify --network base_sepolia <合约地址> <构造函数参数>
```

---

## 注意事项

1. 本文档中的合约地址由部署脚本自动生成并保存到 `.env` 文件
2. 部署前请确保已配置正确的 RPC URL 和私钥
3. 部署账户需要拥有足够的测试币支付 Gas 费
4. 每次重新部署会生成新的合约地址，请及时更新本文档

---

**最后更新**: 2026-03-25
**项目**: Reactive DeFi Bot
**模式**: Mock (演示模式)
