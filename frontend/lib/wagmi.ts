"use client";

import { createConfig, http } from "wagmi";
import { localhost, sepolia, baseSepolia, mainnet, base } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";
import { defineChain } from "viem";

export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV || "local";
const localRpcUrl = process.env.NEXT_PUBLIC_LOCAL_RPC_URL || "http://127.0.0.1:8545";

export const reactiveTestnet = defineChain({
  id: 5318008,
  name: "Reactive Kopli",
  nativeCurrency: {
    name: "Reactive",
    symbol: "REACT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_REACTIVE_RPC_URL || "https://kopli-rpc.rkt.ink"],
    },
  },
  blockExplorers: {
    default: {
      name: "Reactive Explorer",
      url: "https://kopli.reactscan.net",
    },
  },
});

export const reactiveChain = APP_ENV === "local" ? localhost : reactiveTestnet;
export const originChain = APP_ENV === "local" ? localhost : APP_ENV === "mainnet" ? mainnet : sepolia;
export const destinationChain = APP_ENV === "local" ? localhost : APP_ENV === "mainnet" ? base : baseSepolia;

const activeChains =
  APP_ENV === "local"
    ? [localhost]
    : APP_ENV === "mainnet"
      ? [mainnet, base, reactiveChain]
      : [baseSepolia, sepolia, reactiveChain];

export const config = createConfig({
  ssr: true,
  chains: activeChains,
  connectors: [injected(), metaMask()],
  transports: {
    ...(APP_ENV === "local"
      ? {
          [localhost.id]: http(localRpcUrl),
        }
      : {}),
    ...(APP_ENV !== "local"
      ? {
          [destinationChain.id]: http(),
          [originChain.id]: http(),
          [reactiveChain.id]: http(process.env.NEXT_PUBLIC_REACTIVE_RPC_URL || "https://kopli-rpc.rkt.ink"),
        }
      : {}),
  },
});

// 合约地址（部署后填入）
export const CONTRACTS = {
  userVault: (process.env.NEXT_PUBLIC_USER_VAULT_ADDRESS || "") as `0x${string}`,
  rcFactory: (process.env.NEXT_PUBLIC_RC_FACTORY_ADDRESS || "") as `0x${string}`,
};

// 佣金率（与合约保持一致）
export const FEE_RATE = 20; // 20%
