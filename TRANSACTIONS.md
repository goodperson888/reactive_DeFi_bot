# 交易哈希记录

本文档记录了 Reactive DeFi Bot 项目中所有关键交易的哈希值，用于比赛提交验证。

## 部署交易

### Origin 链（Sepolia）
Deploying origin contracts on sepolia...
  MockLending: 0x2A94622140020B2C44AF7e3271D046Dd4252B2a2
  MockDEX A:   0xfd94EC8a8ce0D8497Bc332698d8423f23825D632
### Destination 链（Base Sepolia）
 Deploying destination contracts on base_sepolia...
  MockDEX B:            0x12e51553d70CBD7a00c94F3F7b6aF1702882fe78
  LiquidationExecutor:  0x4d499E47a79869720422c6A01fC23f3997bdE8cD
  ArbitrageExecutor:    0xE2175B8A273fDa86933dC1747D111FffE50bBd4d
### Reactive Network
Deploying RCController on lasna...
  RCController: 0x71Fd92eb4912D3b2bD527e091A9f7EB17f57136d


Deploying RCController on lasna...
  RCController: 0x71Fd92eb4912D3b2bD527e091A9f7EB17f57136d

  RCController: 0x71Fd92eb4912D3b2bD527e091A9f7EB17f57136d
---

## 清算演示交易

### 清算演示 - 存入抵押品

- [2026-03-26T10:00:30.888Z] **清算演示 - 存入抵押品**: 存入 0.01 ETH 作为抵押品
  - 交易哈希: `0xe54f5341adbc98cd8e16c38fd324b3713f6a537e735097c421e5afcc00b1e92c`


- [2026-03-26T03:43:25.376Z] **清算演示 - 存入抵押品**: 存入 0.01 ETH 作为抵押品
  - 交易哈希: `0x39e73b0ec6970a3b7d817ee3e92ee851029e3ca795981b8062dc179fe1345afb`


### 清算演示 - 借款

- [2026-03-26T10:00:30.890Z] **清算演示 - 借款**: 借款 20 USDC
  - 交易哈希: `0x3be708535ba0969886eec713d18e7e85dc928e43590a434c5e1df050fa3949c7`


- [2026-03-26T03:43:25.378Z] **清算演示 - 借款**: 借款 20 USDC
  - 交易哈希: `0x5fd41a877926331061ad87fb4229c3a9987afd8ff240431b508d9826b420e738`


### 清算演示 - 降价

- [2026-03-26T10:00:30.891Z] **清算演示 - 降价**: 降低 ETH 价格（3000 → 2400）触发清算
  - 交易哈希: `0xed99bb74ac962d0702300f1b888ad1dea16b0f9d961368bbe1384dae629d0112`


- [2026-03-26T03:43:25.379Z] **清算演示 - 降价**: 降低 ETH 价格（3000 → 2400）触发清算
  - 交易哈希: `0x74a0db04c27151f63d2c73b8424d0edea08d416b3a19bc7d82c8159feff12fe1`


---

## 套利演示交易

### 套利演示 - Swap

---

## 注意事项

1. 本文档由演示脚本自动生成和维护
2. 每次运行演示脚本时，新的交易记录会自动追加到相应章节
3. 时间戳使用 ISO 8601 格式
4. 交易哈希格式：`0x...` (64 字符十六进制字符串)

---

**生成时间**: 2026-03-25
**项目**: Reactive DeFi Bot
**网络**: Sepolia / Base Sepolia / Reactive Network Testnet
### Arbitrage Demo - Swap

- [2026-03-26T09:52:37.666Z] **Arbitrage Demo - Swap**: Swap on origin chain to trigger arbitrage flow
  - 交易哈希: `0x308ef2607881f408c026f29e5e38f16bad8b63d82db0f3aa85768acb59802aae`


- [2026-03-26T04:43:16.525Z] **Arbitrage Demo - Swap**: Swap on origin chain to trigger arbitrage flow
  - 交易哈希: `0x79eb644ab5be1471ce6b37ebe08cbc5c5f20e6eba6266867aa5fb691249c3d57`