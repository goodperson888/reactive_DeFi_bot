require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
try {
  require("hardhat-deploy");
} catch {
  // Legacy config fallback: keep this file loadable even when the deploy plugin is not installed.
}

// 兼容两套环境变量命名，保留当前网络命名不变
const sepolia_url = process.env.SEPOLIA_URL || process.env.SEPOLIA_RPC_URL || "";
const base_sepolia_url = process.env.BASE_SEPOLIA_URL || process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const lasna_url = process.env.LASNA_URL || process.env.REACTIVE_RPC_URL || "https://lasna-rpc.rnk.dev/";
const my_key1 = process.env.WALLET_KEY1 || process.env.PRIVATE_KEY || "";
const my_key2 = process.env.WALLET_KEY2 || "";
const MY_API_KEY = process.env.API_KEY || process.env.ETHERSCAN_API_KEY || "";
const accounts = [my_key1, my_key2].filter(Boolean);

/** @type import('hardhat/config').HardhatUserConfig */

module.exports = {
  solidity: "0.8.28",

  defaultNetwork: "hardhat",

  networks: {
    sepolia: {
      url: sepolia_url,
      accounts,
      chainId: 11155111
    },

    base_sepolia: {
      url: base_sepolia_url,
      chainId: 84532,
      accounts,
    },

      "cancun": {
    url: "https://evmrpc-testnet.0g.ai",
    chainId: 16602,
    accounts,
    gas: "auto",
    gasPrice: "auto",
  },
     lasna: {
    url: lasna_url,
    accounts,
    chainId: 5318007,
    gas: "auto",
    gasPrice: "auto",
  },
     // BNB Smart Chain Testnet
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
      chainId: 97,
      accounts,
      gas: "auto",
    },


  },

  etherscan: {
    apiKey: MY_API_KEY
  },

  namedAccounts: {
    firstAccount: {
      default: 0
    },
    secondAccount: {
      default: 1
    },
  }
};
