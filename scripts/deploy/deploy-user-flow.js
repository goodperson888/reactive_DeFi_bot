import hre from "hardhat";
import fs from "fs";
import path from "path";
import { Contract, ContractFactory, JsonRpcProvider, NonceManager, Wallet, parseEther } from "ethers";
import { APP_ENV, PROTOCOL_MODE, CHAINS, isLocal } from "../../config/index.js";

const deployments = {};
const DEFAULT_LOCAL_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  if (PROTOCOL_MODE !== "mock") {
    throw new Error("The per-user frontend flow currently supports PROTOCOL_MODE=mock only.");
  }

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

  const origin = await ensureOriginMocks(artifacts, wallets.sepolia);
  const userVaultAddress = await deployUserVault(artifacts, wallets.baseSepolia);
  const rcFactoryAddress = await deployRCFactory(
    artifacts,
    wallets.reactive,
    userVaultAddress,
    origin.mockLending,
    origin.mockDexA,
  );
  await linkVaultToFactory(artifacts, wallets.baseSepolia, userVaultAddress, rcFactoryAddress);

  saveDeployments();
  syncFrontendEnv();

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ 用户前端流部署完成！\n");
  console.log(`UserVault (Base Sepolia): ${userVaultAddress}`);
  console.log(`RCFactory (Reactive):     ${rcFactoryAddress}`);
  console.log(`MockLending (Sepolia):    ${origin.mockLending}`);
  console.log(`MockDEX A (Sepolia):      ${origin.mockDexA}`);
}

function resolveDeploymentKey() {
  if (isLocal) {
    return process.env.LOCAL_PRIVATE_KEY || DEFAULT_LOCAL_PRIVATE_KEY;
  }

  const privateKey = process.env.PRIVATE_KEY || "";
  return /^0x[0-9a-fA-F]{64}$/.test(privateKey) ? privateKey : "";
}

async function loadArtifacts() {
  return {
    MockLending: await hre.artifacts.readArtifact("MockLending"),
    MockDEX: await hre.artifacts.readArtifact("MockDEX"),
    UserVault: await hre.artifacts.readArtifact("UserVault"),
    RCFactory: await hre.artifacts.readArtifact("RCFactory"),
  };
}

function makeProviders() {
  return {
    sepolia: new JsonRpcProvider(CHAINS.origin.rpc),
    baseSepolia: new JsonRpcProvider(CHAINS.destination.rpc),
    reactive: new JsonRpcProvider(CHAINS.reactive.rpc),
  };
}

function makeWallets(privateKey, providers) {
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

async function ensureOriginMocks(artifacts, wallet) {
  let mockLendingAddress = process.env.MOCK_LENDING_ADDRESS || "";
  let mockDexAAddress = process.env.MOCK_DEX_A_ADDRESS || "";

  if (!mockLendingAddress) {
    console.log("\n📍 部署 Origin MockLending...");
    const factory = new ContractFactory(artifacts.MockLending.abi, artifacts.MockLending.bytecode, wallet);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    mockLendingAddress = await contract.getAddress();
    deployments.MOCK_LENDING_ADDRESS = mockLendingAddress;
    console.log(`  ✓ MockLending: ${mockLendingAddress}`);
  } else {
    console.log(`\n📍 复用现有 MockLending: ${mockLendingAddress}`);
  }

  if (!mockDexAAddress) {
    console.log("📍 部署 Origin MockDEX...");
    const factory = new ContractFactory(artifacts.MockDEX.abi, artifacts.MockDEX.bytecode, wallet);
    const contract = await factory.deploy({ value: parseEther("0.1") });
    await contract.waitForDeployment();
    mockDexAAddress = await contract.getAddress();
    deployments.MOCK_DEX_A_ADDRESS = mockDexAAddress;
    console.log(`  ✓ MockDEX A: ${mockDexAAddress}`);
  } else {
    console.log(`📍 复用现有 MockDEX A: ${mockDexAAddress}`);
  }

  return { mockLending: mockLendingAddress, mockDexA: mockDexAAddress };
}

async function deployUserVault(artifacts, wallet) {
  console.log("\n📍 部署 UserVault (Base Sepolia)...");
  const factory = new ContractFactory(artifacts.UserVault.abi, artifacts.UserVault.bytecode, wallet);
  const deployerAddress = await wallet.getAddress();
  const contract = await factory.deploy(deployerAddress);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  deployments.USER_VAULT_ADDRESS = address;
  console.log(`  ✓ UserVault: ${address}`);
  return address;
}

async function deployRCFactory(artifacts, wallet, userVaultAddress, mockLendingAddress, mockDexAAddress) {
  console.log("\n📍 部署 RCFactory (Reactive)...");
  const factory = new ContractFactory(artifacts.RCFactory.abi, artifacts.RCFactory.bytecode, wallet);
  const contract = await factory.deploy(userVaultAddress, mockLendingAddress, mockDexAAddress);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  deployments.RC_FACTORY_ADDRESS = address;
  console.log(`  ✓ RCFactory: ${address}`);
  return address;
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
  const content = [
    "# Auto-generated from root .env",
    `NEXT_PUBLIC_APP_ENV=${APP_ENV}`,
    `NEXT_PUBLIC_LOCAL_RPC_URL=${process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545"}`,
    `NEXT_PUBLIC_USER_VAULT_ADDRESS=${deployments.USER_VAULT_ADDRESS || process.env.USER_VAULT_ADDRESS || ""}`,
    `NEXT_PUBLIC_RC_FACTORY_ADDRESS=${deployments.RC_FACTORY_ADDRESS || process.env.RC_FACTORY_ADDRESS || ""}`,
    `NEXT_PUBLIC_REACTIVE_RPC_URL=${process.env.REACTIVE_RPC_URL || "https://kopli-rpc.rkt.ink"}`,
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
