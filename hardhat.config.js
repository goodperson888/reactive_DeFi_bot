import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import { CHAINS } from "./config/index.js";

// 只在私钥是有效的 0x 开头 hex 字符串时才使用
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts =
  PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY)
    ? [PRIVATE_KEY]
    : [];

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  networks: {
    hardhat: {},
    localhost: { url: "http://127.0.0.1:8545" },

    sepolia: {
      url: CHAINS.origin.rpc || "https://rpc.sepolia.org",
      chainId: CHAINS.origin.chainId,
      accounts,
    },

    "base-sepolia": {
      url: CHAINS.destination.rpc || "https://sepolia.base.org",
      chainId: CHAINS.destination.chainId,
      accounts,
    },

    reactive: {
      url: CHAINS.reactive.rpc || "https://kopli-rpc.rkt.ink",
      chainId: CHAINS.reactive.chainId,
      accounts,
    },
  },

  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      "base-sepolia": process.env.BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
};
