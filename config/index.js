import "dotenv/config";

// ─── 链配置 ───────────────────────────────────────────────────────────────────

const LEGACY_MODE = process.env.MODE;

export const APP_ENV =
  process.env.APP_ENV ||
  (LEGACY_MODE === "prod" ? "testnet" : LEGACY_MODE === "mock" ? "local" : "local");

export const PROTOCOL_MODE = process.env.PROTOCOL_MODE || LEGACY_MODE || "mock";

export const MODE = PROTOCOL_MODE; // 兼容旧脚本
export const isProd = PROTOCOL_MODE === "prod";
export const isLocal = APP_ENV === "local";
export const isTestnet = APP_ENV === "testnet";
export const isMainnet = APP_ENV === "mainnet";

const LOCAL_RPC = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";

export const CHAINS = {
  origin: {
    name: isLocal ? "localhost" : isMainnet ? "ethereum" : "sepolia",
    chainId: isLocal ? 31337 : isMainnet ? Number(process.env.ORIGIN_MAINNET_CHAIN_ID || 1) : 11155111,
    rpc: isLocal ? LOCAL_RPC : isMainnet ? (process.env.ORIGIN_MAINNET_RPC_URL || process.env.ETHEREUM_RPC_URL || "") : process.env.SEPOLIA_RPC_URL,
  },
  destination: {
    name: isLocal ? "localhost" : isMainnet ? "base" : "base-sepolia",
    chainId: isLocal ? 31337 : isMainnet ? Number(process.env.DESTINATION_MAINNET_CHAIN_ID || 8453) : 84532,
    rpc: isLocal ? LOCAL_RPC : isMainnet ? (process.env.DESTINATION_MAINNET_RPC_URL || process.env.BASE_RPC_URL || "") : process.env.BASE_SEPOLIA_RPC_URL,
  },
  reactive: {
    name: isLocal ? "localhost" : isMainnet ? "reactive-mainnet" : "reactive-testnet",
    chainId: isLocal ? 31337 : Number(process.env.REACTIVE_CHAIN_ID || 5318008),
    rpc: isLocal ? LOCAL_RPC : (process.env.REACTIVE_RPC_URL || (isMainnet ? "https://mainnet-rpc.rnk.dev/" : "https://lasna-rpc.rnk.dev/")),
  },
};

// ─── 合约地址 ──────────────────────────────────────────────────────────────────

const CONTRACTS_ALL = {
  mock: {
    origin: {
      mockLending: process.env.MOCK_LENDING_ADDRESS || "",
      mockDexA:    process.env.MOCK_DEX_A_ADDRESS    || "",
    },
    destination: {
      mockDexB:             process.env.MOCK_DEX_B_ADDRESS             || "",
      liquidationExecutor:  process.env.LIQUIDATION_EXECUTOR_ADDRESS   || "",
      arbitrageExecutor:    process.env.ARBITRAGE_EXECUTOR_ADDRESS      || "",
    },
    reactive: {
      rcController: process.env.RC_CONTROLLER_ADDRESS || "",
    },
  },

  prod: {
    origin: {
      aavePool:        "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951", // Aave v3 Sepolia
      uniswapFactory:  "0xF62c03E08ada871A0bEb309762E260a7a6a880E6",
    },
    destination: {
      sushiswapRouter:     process.env.SUSHISWAP_ROUTER_BASE_SEPOLIA || "",
      uniswapRouter:       process.env.UNISWAP_ROUTER_BASE_SEPOLIA   || "",
      liquidationExecutor: process.env.LIQUIDATION_EXECUTOR_ADDRESS   || "",
      arbitrageExecutor:   process.env.ARBITRAGE_EXECUTOR_ADDRESS      || "",
    },
    reactive: {
      rcController: process.env.RC_CONTROLLER_ADDRESS || "",
    },
  },
};

export const CONTRACTS = CONTRACTS_ALL[PROTOCOL_MODE];

// ─── 策略参数 ──────────────────────────────────────────────────────────────────

export const STRATEGY = {
  liquidation: {
    healthFactorThreshold: isProd ? "1.02" : "1.05",
    maxDebtUSD:   isProd ? 5000    : 10000,
    minProfitUSD: isProd ? 10      : 1,
  },
  arbitrage: {
    spreadThreshold:      isProd ? 1.5     : 1.0,
    maxPoolLiquidityUSD:  isProd ? 500000  : 9999999,
    maxPositionPct:       20,
    slippagePct:          2,
  },
  risk: {
    maxConsecutiveLosses: 3,
    gasProfitCheck:       true,
    maxGasGwei:           isProd ? 50 : 1,//手续费上限，单位gwei
  },
};
