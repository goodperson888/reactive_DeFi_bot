require("dotenv").config();

const MODE = process.env.MODE || "mock";
const isProd = MODE === "prod";

const CHAINS = {
  origin: {
    name: "sepolia",
    chainId: 11155111,
    rpc: process.env.SEPOLIA_RPC_URL || process.env.SEPOLIA_URL || "https://rpc.sepolia.org",
  },
  destination: {
    name: "base_sepolia",
    chainId: 84532,
    rpc: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_URL || "https://sepolia.base.org",
  },
  reactive: {
    name: "lasna",
    chainId: 5318007,
    rpc: process.env.REACTIVE_RPC_URL || process.env.LASNA_URL || "https://lasna-rpc.rnk.dev/",
  },
};

const CONTRACTS_ALL = {
  mock: {
    origin: {
      mockLending: process.env.MOCK_LENDING_ADDRESS || "",
      mockDexA: process.env.MOCK_DEX_A_ADDRESS || "",
    },
    destination: {
      mockDexB: process.env.MOCK_DEX_B_ADDRESS || "",
      liquidationExecutor: process.env.LIQUIDATION_EXECUTOR_ADDRESS || "",
      arbitrageExecutor: process.env.ARBITRAGE_EXECUTOR_ADDRESS || "",
    },
    reactive: {
      rcController: process.env.RC_CONTROLLER_ADDRESS || "",
    },
  },
  prod: {
    origin: {
      aavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
      uniswapFactory: "0xF62c03E08ada871A0bEb309762E260a7a6a880E6",
    },
    destination: {
      sushiswapRouter: process.env.SUSHISWAP_ROUTER_BASE_SEPOLIA || "",
      uniswapRouter: process.env.UNISWAP_ROUTER_BASE_SEPOLIA || "",
      liquidationExecutor: process.env.LIQUIDATION_EXECUTOR_ADDRESS || "",
      arbitrageExecutor: process.env.ARBITRAGE_EXECUTOR_ADDRESS || "",
    },
    reactive: {
      rcController: process.env.RC_CONTROLLER_ADDRESS || "",
    },
  },
};

const CONTRACTS = CONTRACTS_ALL[MODE];

const STRATEGY = {
  liquidation: {
    healthFactorThreshold: isProd ? "1.02" : "1.05",
    maxDebtUSD: isProd ? 5000 : 10000,
    minProfitUSD: isProd ? 10 : 1,
  },
  arbitrage: {
    spreadThreshold: isProd ? 1.5 : 1.0,
    maxPoolLiquidityUSD: isProd ? 500000 : 9999999,
    maxPositionPct: 20,
    slippagePct: 2,
  },
  risk: {
    maxConsecutiveLosses: 3,
    gasProfitCheck: true,
    maxGasGwei: isProd ? 50 : 100,
  },
};

module.exports = {
  MODE,
  isProd,
  CHAINS,
  CONTRACTS,
  STRATEGY,
};
