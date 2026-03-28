import hre from "hardhat";
import fs from "fs";
import path from "path";
import { Contract, ContractFactory, JsonRpcProvider, NonceManager, Wallet, parseEther, ZeroAddress, id } from "ethers";
import { APP_ENV, PROTOCOL_MODE, CHAINS, isLocal } from "../../config/index.js";

const deployments = {};
const DEFAULT_LOCAL_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  // Deployment entry for the full user-flow stack.
  // 前端用户流的一体化部署入口。
  const useRealProtocol = PROTOCOL_MODE === "prod" || PROTOCOL_MODE === "real";

  // ─── 事件 Topic（mock vs 真实协议）───────────────────────────────────────
  const TOPICS = useRealProtocol ? {
    liquidation: id("LiquidationCall(address,address,address,uint256,uint256,address,bool)"),
    arbitrage: id("Swap(address,address,int256,int256,uint160,uint128,int24)"),
  } : {
    liquidation: id("HealthFactorUpdated(address,uint256,uint256,uint256)"),
    arbitrage: id("Swap(address,address,address,uint256,uint256,uint256)"),
  };

  // ─── Reactive Network 回调 sender 地址 ──────────────────────────────────
  const REACTIVE_CALLBACK_SENDERS = {
    testnet: "0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6",
    mainnet: "",  // TODO: 主网地址待官方确认
  };

  // ─── 真实协议地址（Destination 链上的 Uniswap V3）──────────────────────
  const PROTOCOL_ADDRESSES = {
    testnet: {
      swapRouter: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4", // Uniswap V3 SwapRouter - Base Sepolia
      weth: "0x4200000000000000000000000000000000000006", // WETH - Base Sepolia
      stableToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC - Base Sepolia
      swapFeeTier: 3000,
      // Origin 链真实合约（Sepolia）
      aavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951", // Aave V3 Pool
      uniswapPool: process.env.UNISWAP_POOL_SEPOLIA || "",        // 需要指定具体监听的池子
    },
    mainnet: {
      swapRouter: "0x2626664c2603336E57B271c5C0b26F421741e481", // Uniswap V3 SwapRouter - Base
      weth: "0x4200000000000000000000000000000000000006", // WETH - Base
      stableToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC - Base
      swapFeeTier: 500,
      // Origin 链真实合约（Ethereum）
      aavePool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", // Aave V3 Pool
      uniswapPool: process.env.UNISWAP_POOL_MAINNET || "",
    },
  };

  const privateKey = resolveDeploymentKey();
  if (!privateKey) {
    throw new Error(
      isLocal
        ? "Local deployment needs a running local node. Start one with `npm run local:node`."
        : "PRIVATE_KEY is missing or invalid in .env",
    );
  }

  console.log(`\n🚀 开始部署前端用户流合约 - APP_ENV: ${APP_ENV}, PROTOCOL_MODE: ${PROTOCOL_MODE}\n`);
  console.log("=".repeat(60));

  const artifacts = await loadArtifacts();
  const providers = makeProviders();
  const wallets = makeWallets(privateKey, providers);

  if (isLocal) await injectMockReactiveService(artifacts);

  const origin = await resolveOriginContracts(artifacts, wallets.sepolia, useRealProtocol, PROTOCOL_ADDRESSES[APP_ENV]);
  const destination = await resolveDestinationContracts(artifacts, wallets.baseSepolia, useRealProtocol);
  const userVaultAddress = await deployUserVault(artifacts, wallets.baseSepolia, REACTIVE_CALLBACK_SENDERS[APP_ENV] || ZeroAddress);
  const rcFactoryAddress = await deployRCFactory(
    artifacts,
    wallets.reactive,
    userVaultAddress,
    origin.lending,
    origin.dex,
    TOPICS,
  );
  await linkVaultToFactory(artifacts, wallets.baseSepolia, userVaultAddress, rcFactoryAddress);

  // 真实协议模式：配置 UserVault 的 Uniswap V3 执行参数
  if (useRealProtocol && PROTOCOL_ADDRESSES[APP_ENV]) {
    await configureProtocol(artifacts, wallets.baseSepolia, userVaultAddress, PROTOCOL_ADDRESSES[APP_ENV]);
  }

  saveDeployments();
  syncFrontendEnv();

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ 用户前端流部署完成！\n");
  console.log(`  协议模式:    ${useRealProtocol ? "真实 (Aave/Uniswap)" : "Mock"}`);
  console.log(`  UserVault:   ${userVaultAddress}`);
  console.log(`  RCFactory:   ${rcFactoryAddress}`);
  console.log(`  Origin 借贷: ${origin.lending}`);
  console.log(`  Origin DEX:  ${origin.dex}`);
  if (!useRealProtocol) {
    console.log(`  Dest DEX:    ${destination.dex}`);
  }
}

function resolveDeploymentKey() {
  // Local uses default funded key; remote env requires PRIVATE_KEY.
  // 本地使用默认测试私钥；测试网/主网必须提供 PRIVATE_KEY。
  if (isLocal) {
    return process.env.LOCAL_PRIVATE_KEY || DEFAULT_LOCAL_PRIVATE_KEY;
  }

  const privateKey = process.env.PRIVATE_KEY || "";
  return /^0x[0-9a-fA-F]{64}$/.test(privateKey) ? privateKey : "";
}

async function loadArtifacts() {
  // Load all compiled contract artifacts required by this deploy script.
  // 加载本部署脚本需要的所有编译产物。
  const artifacts = {
    MockLending: await hre.artifacts.readArtifact("MockLending"),
    MockDEX: await hre.artifacts.readArtifact("MockDEX"),
    UserVault: await hre.artifacts.readArtifact("UserVault"),
    RCFactory: await hre.artifacts.readArtifact("RCFactory"),
  };
  if (isLocal) {
    artifacts.MockReactiveService = await hre.artifacts.readArtifact("MockReactiveService");
  }
  return artifacts;
}

function makeProviders() {
  // Create RPC providers for origin/destination/reactive networks.
  // 分别创建源链/目标链/Reactive 链的 RPC Provider。
  return {
    sepolia: new JsonRpcProvider(CHAINS.origin.rpc),
    baseSepolia: new JsonRpcProvider(CHAINS.destination.rpc),
    reactive: new JsonRpcProvider(CHAINS.reactive.rpc),
  };
}

function makeWallets(privateKey, providers) {
  // Local mode can share nonce manager; remote mode keeps per-chain nonce manager.
  // 本地模式可共享 nonce 管理器；远程模式按链分别管理 nonce。
  if (isLocal) {
    const shared = new NonceManager(new Wallet(privateKey, providers.sepolia));
    return {
      sepolia: shared,
      baseSepolia: shared,
      reactive: shared,
    };
  }

  return {
    sepolia: new NonceManager(new Wallet(privateKey, providers.sepolia)),
    baseSepolia: new NonceManager(new Wallet(privateKey, providers.baseSepolia)),
    reactive: new NonceManager(new Wallet(privateKey, providers.reactive)),
  };
}

async function injectMockReactiveService(artifacts) {
  const SERVICE_ADDRESS = "0x0000000000000000000000000000000000fffFfF";
  const provider = hre.network.provider;
  const existing = await provider.send("eth_getCode", [SERVICE_ADDRESS, "latest"]);
  if (existing !== "0x") {
    console.log("\n📍 MockReactiveService 已存在于 0xfffFfF，跳过注入");
    return;
  }
  console.log("\n📍 注入 MockReactiveService 到 0xfffFfF (本地开发)...");
  await provider.send("hardhat_setCode", [SERVICE_ADDRESS, artifacts.MockReactiveService.deployedBytecode]);
  console.log("  ✓ 注入完成");
}

async function resolveOriginContracts(artifacts, wallet, useReal, protocolAddrs) {
  // Origin chain side:
  // real mode => reuse protocol addresses; mock mode => deploy/reuse MockLending + MockDEX A.
  // 源链侧：
  // 真实模式复用协议地址；Mock 模式部署或复用 MockLending + MockDEX A。
  // 真实协议模式：使用已有的 Aave/Uniswap 合约地址
  if (useReal && protocolAddrs) {
    const lending = protocolAddrs.aavePool;
    const dex = protocolAddrs.uniswapPool;
    if (!lending || !dex) {
      throw new Error("真实协议模式需要 aavePool 和 uniswapPool 地址，请在 .env 或 PROTOCOL_ADDRESSES 中配置");
    }
    console.log(`\n📍 使用真实协议合约:`);
    console.log(`  Aave V3 Pool:   ${lending}`);
    console.log(`  Uniswap V3 Pool: ${dex}`);
    return { lending, dex };
  }

  // Mock 模式：部署 MockLending / MockDEX
  let lendingAddr = process.env.MOCK_LENDING_ADDRESS || "";
  let dexAddr = process.env.MOCK_DEX_A_ADDRESS || "";

  if (!lendingAddr) {
    console.log("\n📍 部署 Origin MockLending...");
    const factory = new ContractFactory(artifacts.MockLending.abi, artifacts.MockLending.bytecode, wallet);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    lendingAddr = await contract.getAddress();
    deployments.MOCK_LENDING_ADDRESS = lendingAddr;
    console.log(`  ✓ MockLending: ${lendingAddr}`);
  } else {
    console.log(`\n📍 复用现有 MockLending: ${lendingAddr}`);
  }

  if (!dexAddr) {
    console.log("📍 部署 Origin MockDEX...");
    const factory = new ContractFactory(artifacts.MockDEX.abi, artifacts.MockDEX.bytecode, wallet);
    const contract = await factory.deploy({ value: parseEther("0.1") });
    await contract.waitForDeployment();
    dexAddr = await contract.getAddress();
    deployments.MOCK_DEX_A_ADDRESS = dexAddr;
    console.log(`  ✓ MockDEX A: ${dexAddr}`);
  } else {
    console.log(`📍 复用现有 MockDEX A: ${dexAddr}`);
  }

  return { lending: lendingAddr, dex: dexAddr };
}

async function resolveDestinationContracts(artifacts, wallet, useReal) {
  // Destination chain side:
  // real mode => skip mock DEX; mock mode => deploy/reuse MockDEX B.
  // 目标链侧：
  // 真实模式跳过 Mock DEX；Mock 模式部署或复用 MockDEX B。
  if (useReal) {
    return { dex: "" };
  }

  let dexAddr = process.env.MOCK_DEX_B_ADDRESS || "";
  if (!dexAddr) {
    console.log("\n📍 部署 Destination MockDEX (Base Sepolia)...");
    const factory = new ContractFactory(artifacts.MockDEX.abi, artifacts.MockDEX.bytecode, wallet);
    const contract = await factory.deploy({ value: parseEther("0.1") });
    await contract.waitForDeployment();
    dexAddr = await contract.getAddress();
    deployments.MOCK_DEX_B_ADDRESS = dexAddr;
    console.log(`  ✓ MockDEX B: ${dexAddr}`);
  } else {
    console.log(`\n📍 复用现有 MockDEX B: ${dexAddr}`);
  }

  return { dex: dexAddr };
}

async function deployUserVault(artifacts, wallet, callbackSender) {
  // Deploy UserVault on destination chain and persist address.
  // 在目标链部署 UserVault 并保存地址。
  console.log("\n📍 部署 UserVault (Base Sepolia)...");
  const factory = new ContractFactory(artifacts.UserVault.abi, artifacts.UserVault.bytecode, wallet);
  const deployerAddress = await wallet.getAddress();
  const contract = await factory.deploy(deployerAddress, callbackSender);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  deployments.USER_VAULT_ADDRESS = address;
  console.log(`  ✓ UserVault: ${address}`);
  return address;
}

async function deployRCFactory(artifacts, wallet, userVaultAddress, lendingAddress, dexAddress, topics) {
  // Deploy RCFactory on Reactive and wire liquidation/arbitrage topics.
  // 在 Reactive 链部署 RCFactory，并注入清算/套利 Topic。
  console.log("\n📍 部署 RCFactory (Reactive)...");
  const factory = new ContractFactory(artifacts.RCFactory.abi, artifacts.RCFactory.bytecode, wallet);
  const contract = await factory.deploy(
    userVaultAddress,
    lendingAddress,
    dexAddress,
    CHAINS.origin.chainId,
    CHAINS.destination.chainId,
    topics.liquidation,
    topics.arbitrage
  );
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  deployments.RC_FACTORY_ADDRESS = address;
  console.log(`  ✓ RCFactory: ${address}`);
  return address;
}

async function configureProtocol(artifacts, wallet, userVaultAddress, protocolAddrs) {
  console.log("\n📍 配置 UserVault 真实协议参数...");
  const vault = new Contract(userVaultAddress, artifacts.UserVault.abi, wallet);
  const tx = await vault.setProtocolConfig(
    1, // protocolMode = real
    protocolAddrs.swapRouter,
    protocolAddrs.weth,
    protocolAddrs.stableToken,
    protocolAddrs.swapFeeTier
  );
  await tx.wait();
  console.log(`  ✓ 已配置: SwapRouter=${protocolAddrs.swapRouter}, WETH=${protocolAddrs.weth}, USDC=${protocolAddrs.stableToken}, fee=${protocolAddrs.swapFeeTier}`);
}

async function linkVaultToFactory(artifacts, wallet, userVaultAddress, rcFactoryAddress) {
  console.log("\n📍 回写 Vault 中的 RCFactory 地址...");
  const vault = new Contract(userVaultAddress, artifacts.UserVault.abi, wallet);
  const tx = await vault.setRCFactory(rcFactoryAddress);
  await tx.wait();
  console.log("  ✓ 已设置 RCFactory");
}

function saveDeployments() {
  const envPath = path.join(process.cwd(), ".env");
  let envContent = fs.readFileSync(envPath, "utf8");

  for (const [key, value] of Object.entries(deployments)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, envContent);
  console.log("\n✓ 已更新根目录 .env");
}

function syncFrontendEnv() {
  const frontendEnvPath = path.join(process.cwd(), "frontend", ".env.local");
  const privateKey = process.env.PRIVATE_KEY || "";
  const demoWalletAddress = /^0x[0-9a-fA-F]{64}$/.test(privateKey)
    ? new Wallet(privateKey).address
    : "";
  const content = [
    "# Auto-generated from root .env",
    `NEXT_PUBLIC_APP_ENV=${APP_ENV}`,
    `NEXT_PUBLIC_AUTOMATION_MODE=${process.env.AUTOMATION_MODE || "reactive"}`,
    `NEXT_PUBLIC_LOCAL_RPC_URL=${process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545"}`,
    `NEXT_PUBLIC_ORIGIN_RPC_URL=${process.env.SEPOLIA_RPC_URL || process.env.SEPOLIA_URL || ""}`,
    `NEXT_PUBLIC_DEST_RPC_URL=${process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_URL || ""}`,
    `NEXT_PUBLIC_USER_VAULT_ADDRESS=${deployments.USER_VAULT_ADDRESS || process.env.USER_VAULT_ADDRESS || ""}`,
    `NEXT_PUBLIC_RC_FACTORY_ADDRESS=${deployments.RC_FACTORY_ADDRESS || process.env.RC_FACTORY_ADDRESS || ""}`,
    `NEXT_PUBLIC_MOCK_LENDING_ADDRESS=${deployments.MOCK_LENDING_ADDRESS || process.env.MOCK_LENDING_ADDRESS || ""}`,
    `NEXT_PUBLIC_MOCK_DEX_A_ADDRESS=${deployments.MOCK_DEX_A_ADDRESS || process.env.MOCK_DEX_A_ADDRESS || ""}`,
    `NEXT_PUBLIC_MOCK_DEX_B_ADDRESS=${deployments.MOCK_DEX_B_ADDRESS || process.env.MOCK_DEX_B_ADDRESS || ""}`,
    `NEXT_PUBLIC_DEMO_WALLET_ADDRESS=${demoWalletAddress}`,
    `NEXT_PUBLIC_REACTIVE_RPC_URL=${process.env.REACTIVE_RPC_URL || "https://lasna-rpc.rnk.dev/"}`,
    "",
  ].join("\n");

  fs.writeFileSync(frontendEnvPath, content);
  console.log("✓ 已同步 frontend/.env.local");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
