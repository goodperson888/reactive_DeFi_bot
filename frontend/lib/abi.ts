export const RC_FACTORY_ABI = [
  {
    name: "deployRC", type: "function", stateMutability: "payable",
    inputs: [{
      name: "params", type: "tuple",
      components: [
        { name: "healthFactorThreshold", type: "uint256" },
        { name: "spreadThreshold", type: "uint256" },
        { name: "maxPositionPct", type: "uint256" },
        { name: "slippagePct", type: "uint256" },
        { name: "maxGasGwei", type: "uint256" },
        { name: "maxConsecutiveLosses", type: "uint256" },
        { name: "enableLiquidation", type: "bool" },
        { name: "enableArbitrage", type: "bool" },
      ]
    }],
    outputs: []
  },
  {
    name: "stopRC", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }], outputs: []
  },
  {
    name: "pauseRC", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }], outputs: []
  },
  {
    name: "resumeRC", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }], outputs: []
  },
  {
    name: "topUpRC", type: "function", stateMutability: "payable",
    inputs: [{ name: "user", type: "address" }], outputs: []
  },
  {
    name: "getRCAddress", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ type: "address" }]
  },
  {
    name: "getRCBalance", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }]
  },
  {
    name: "updateParams", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      {
        name: "params", type: "tuple",
        components: [
          { name: "healthFactorThreshold", type: "uint256" },
          { name: "spreadThreshold", type: "uint256" },
          { name: "maxPositionPct", type: "uint256" },
          { name: "slippagePct", type: "uint256" },
          { name: "maxGasGwei", type: "uint256" },
          { name: "maxConsecutiveLosses", type: "uint256" },
          { name: "enableLiquidation", type: "bool" },
          { name: "enableArbitrage", type: "bool" },
        ]
      }
    ],
    outputs: []
  },
  {
    name: "RCDeployed", type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "rcAddress", type: "address", indexed: true },
      { name: "gasFunded", type: "uint256" },
    ]
  },
] as const;

export const USER_VAULT_ABI = [
  // 存款
  { name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] },
  // 提款
  {
    name: "withdraw", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: []
  },
  // 更新策略
  {
    name: "updateStrategy", type: "function", stateMutability: "nonpayable",
    inputs: [{
      name: "params", type: "tuple",
      components: [
        { name: "healthFactorThreshold", type: "uint256" },
        { name: "spreadThreshold", type: "uint256" },
        { name: "maxPositionPct", type: "uint256" },
        { name: "slippagePct", type: "uint256" },
        { name: "maxGasGwei", type: "uint256" },
        { name: "maxConsecutiveLosses", type: "uint256" },
        { name: "enableLiquidation", type: "bool" },
        { name: "enableArbitrage", type: "bool" },
      ]
    }],
    outputs: []
  },
  {
    name: "syncUserRC", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "rcAddress", type: "address" }],
    outputs: []
  },
  // 暂停/恢复
  { name: "pauseStrategy", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "resumeStrategy", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  // 查询用户信息
  {
    name: "getUserInfo", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "balance", type: "uint256" },
      { name: "totalDeposited", type: "uint256" },
      { name: "totalProfit", type: "uint256" },
      { name: "executionCount", type: "uint256" },
      { name: "isActive", type: "bool" },
      { name: "rcAddress", type: "address" },
      {
        name: "params", type: "tuple",
        components: [
          { name: "healthFactorThreshold", type: "uint256" },
          { name: "spreadThreshold", type: "uint256" },
          { name: "maxPositionPct", type: "uint256" },
          { name: "slippagePct", type: "uint256" },
          { name: "maxGasGwei", type: "uint256" },
          { name: "maxConsecutiveLosses", type: "uint256" },
          { name: "enableLiquidation", type: "bool" },
          { name: "enableArbitrage", type: "bool" },
        ]
      },
    ]
  },
  // 全局统计
  { name: "totalTVL", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalFeesCollected", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getUserCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  // 事件
  {
    name: "Deposited", type: "event",
    inputs: [{ name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256" }]
  },
  {
    name: "Withdrawn", type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256" },
      { name: "fee", type: "uint256" }
    ]
  },
  {
    name: "ExecutionResult", type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "strategyType", type: "string" },
      { name: "success", type: "bool" },
      { name: "profit", type: "uint256" },
      { name: "loss", type: "uint256" }
    ]
  },
  {
    name: "StrategyPaused", type: "event",
    inputs: [{ name: "user", type: "address", indexed: true }]
  },
] as const;
