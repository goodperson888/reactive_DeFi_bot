"use client";

import { createConfig, http } from "wagmi";
import { sepolia, baseSepolia, mainnet, base } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";
import { defineChain } from "viem";

export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV || "local";
export const AUTOMATION_MODE = process.env.NEXT_PUBLIC_AUTOMATION_MODE || "reactive";
const localRpcUrl = process.env.NEXT_PUBLIC_LOCAL_RPC_URL || "http://127.0.0.1:8545";

// 与 Hardhat 默认 chainId 31337 匹配，也是 MetaMask Hardhat Localhost 网络的 ID
const hardhatLocalhost = defineChain({
  id: 31337,
  name: "Hardhat Localhost",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [localRpcUrl] } },
});

export const reactiveTestnet = defineChain({
  id: 5318007,
  name: "Reactive Lasna",
  nativeCurrency: { name: "Reactive", symbol: "REACT", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_REACTIVE_RPC_URL || "https://lasna-rpc.rnk.dev/"],
    },
  },
  blockExplorers: {
    default: { name: "Reactive Explorer", url: "https://kopli.reactscan.net" },
  },
});

export const reactiveMainnet = defineChain({
  id: 1597,
  name: "Reactive Mainnet",
  nativeCurrency: { name: "Reactive", symbol: "REACT", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_REACTIVE_RPC_URL || "https://mainnet-rpc.rnk.dev/"],
    },
  },
  blockExplorers: {
    default: { name: "Reactive Explorer", url: "https://reactscan.net" },
  },
});

export const reactiveChain = APP_ENV === "local" ? hardhatLocalhost : APP_ENV === "mainnet" ? reactiveMainnet : reactiveTestnet;
export const originChain = APP_ENV === "local" ? hardhatLocalhost : APP_ENV === "mainnet" ? mainnet : sepolia;
export const destinationChain = APP_ENV === "local" ? hardhatLocalhost : APP_ENV === "mainnet" ? base : baseSepolia;

const activeChains =
  APP_ENV === "local"
    ? ([hardhatLocalhost] as const)
    : APP_ENV === "mainnet"
      ? ([mainnet, base, reactiveMainnet] as const)
      : ([baseSepolia, sepolia, reactiveTestnet] as const);

const chainRpcUrls: Record<number, string | undefined> =
  APP_ENV === "local"
    ? {
        [hardhatLocalhost.id]: localRpcUrl,
      }
    : APP_ENV === "mainnet"
      ? {
          [mainnet.id]: process.env.NEXT_PUBLIC_ORIGIN_RPC_URL,
          [base.id]: process.env.NEXT_PUBLIC_DEST_RPC_URL,
          [reactiveMainnet.id]: process.env.NEXT_PUBLIC_REACTIVE_RPC_URL || "https://mainnet-rpc.rnk.dev/",
        }
      : {
          [baseSepolia.id]: process.env.NEXT_PUBLIC_DEST_RPC_URL,
          [sepolia.id]: process.env.NEXT_PUBLIC_ORIGIN_RPC_URL,
          [reactiveTestnet.id]: process.env.NEXT_PUBLIC_REACTIVE_RPC_URL || "https://lasna-rpc.rnk.dev/",
        };

const transports = Object.fromEntries(
  Object.entries(chainRpcUrls).map(([id, rpcUrl]) => [Number(id), http(rpcUrl)])
) as Record<number, ReturnType<typeof http>>;

export const config = createConfig({
  ssr: true,
  chains: activeChains,
  connectors: [injected(), metaMask()],
  transports,
});

export const CONTRACTS = {
  userVault: (process.env.NEXT_PUBLIC_USER_VAULT_ADDRESS || "") as `0x${string}`,
  rcFactory: (process.env.NEXT_PUBLIC_RC_FACTORY_ADDRESS || "") as `0x${string}`,
  mockLending: (process.env.NEXT_PUBLIC_MOCK_LENDING_ADDRESS || "") as `0x${string}`,
  mockDexA: (process.env.NEXT_PUBLIC_MOCK_DEX_A_ADDRESS || "") as `0x${string}`,
  mockDexB: (process.env.NEXT_PUBLIC_MOCK_DEX_B_ADDRESS || "") as `0x${string}`,
};

export const DEMO_WALLET_ADDRESS = (process.env.NEXT_PUBLIC_DEMO_WALLET_ADDRESS || "") as `0x${string}`;

export const FEE_RATE = 20;
