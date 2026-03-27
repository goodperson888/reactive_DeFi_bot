"use client";

import { createConfig, http } from "wagmi";
import { sepolia, baseSepolia, mainnet, base } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";
import { defineChain } from "viem";

export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV || "local";
const localRpcUrl = process.env.NEXT_PUBLIC_LOCAL_RPC_URL || "http://127.0.0.1:8545";

// 与 Hardhat 默认 chainId 31337 匹配，也是 MetaMask Hardhat Localhost 网络的 ID
const hardhatLocalhost = defineChain({
  id: 31337,
  name: "Hardhat Localhost",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [localRpcUrl] } },
});

export const reactiveTestnet = defineChain({
  id: 5318008,
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
  id: 5318007,
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

export const config = createConfig({
  ssr: true,
  chains: activeChains,
  connectors: [injected(), metaMask()],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transports: ({
    ...(APP_ENV === "local"
      ? { [hardhatLocalhost.id]: http(localRpcUrl) }
      : APP_ENV === "mainnet"
        ? {
            [mainnet.id]: http(process.env.NEXT_PUBLIC_ORIGIN_RPC_URL || undefined),
            [base.id]: http(process.env.NEXT_PUBLIC_DEST_RPC_URL || undefined),
            [reactiveMainnet.id]: http("https://mainnet-rpc.rnk.dev/"),
          }
        : {
            [baseSepolia.id]: http(),
            [sepolia.id]: http(),
            [reactiveTestnet.id]: http(process.env.NEXT_PUBLIC_REACTIVE_RPC_URL || "https://lasna-rpc.rnk.dev/"),
          }),
  }) as any,
});

export const CONTRACTS = {
  userVault: (process.env.NEXT_PUBLIC_USER_VAULT_ADDRESS || "") as `0x${string}`,
  rcFactory: (process.env.NEXT_PUBLIC_RC_FACTORY_ADDRESS || "") as `0x${string}`,
};

export const FEE_RATE = 20;
