/**
 * 部署脚本 - 完整流程
 *
 * 部署顺序：
 * 1. Origin 链（Sepolia）：MockLending + MockDEX
 * 2. Destination 链（Base Sepolia）：MockDEX + Executors
 * 3. Reactive Network：RC Controller
 *
 * 使用方式：
 * MODE=mock npx hardhat run scripts/deploy/deploy-all.js
 */

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { MODE, CHAINS } from "../../config/index.js";

const deployments = {};

async function main() {
  console.log(`\n🚀 开始部署 - 模式: ${MODE}\n`);
  console.log("=" .repeat(60));

  // ─── 1. 部署 Origin 链合约 ────────────────────────────────────────────────

  console.log("\n📍 步骤 1/3: 部署 Origin 链合约（Sepolia）\n");

  await hre.changeNetwork("sepolia");

  // 部署 MockLending
  console.log("  → 部署 MockLending...");
  const MockLending = await hre.ethers.getContractFactory("MockLending");
  const mockLending = await MockLending.deploy();
  await mockLending.waitForDeployment();
  const mockLendingAddr = await mockLending.getAddress();
  console.log(`    ✓ MockLending: ${mockLendingAddr}`);
  deployments.MOCK_LENDING_ADDRESS = mockLendingAddr;

  // 部署 MockDEX (Origin)
  console.log("  → 部署 MockDEX (Origin)...");
  const MockDEX = await hre.ethers.getContractFactory("MockDEX");
  const mockDexA = await MockDEX.deploy({ value: hre.ethers.parseEther("0.1") });
  await mockDexA.waitForDeployment();
  const mockDexAAddr = await mockDexA.getAddress();
  console.log(`    ✓ MockDEX (Origin): ${mockDexAAddr}`);
  deployments.MOCK_DEX_A_ADDRESS = mockDexAAddr;

  // ─── 2. 部署 Destination 链合约 ───────────────────────────────────────────

  console.log("\n📍 步骤 2/3: 部署 Destination 链合约（Base Sepolia）\n");

  await hre.changeNetwork("base-sepolia");

  // 部署 MockDEX (Destination)
  console.log("  → 部署 MockDEX (Destination)...");
  const mockDexB = await MockDEX.deploy({ value: hre.ethers.parseEther("0.1") });
  await mockDexB.waitForDeployment();
  const mockDexBAddr = await mockDexB.getAddress();
  console.log(`    ✓ MockDEX (Destination): ${mockDexBAddr}`);
  deployments.MOCK_DEX_B_ADDRESS = mockDexBAddr;

  // 部署 LiquidationExecutor（临时用零地址，后面更新）
  console.log("  → 部署 LiquidationExecutor...");
  const LiquidationExecutor = await hre.ethers.getContractFactory("LiquidationExecutor");
  const liquidationExecutor = await LiquidationExecutor.deploy(
    hre.ethers.ZeroAddress,  // rcController 地址稍后更新
    hre.ethers.ZeroAddress   // vault 地址（MVP 暂不实现）
  );
  await liquidationExecutor.waitForDeployment();
  const liquidationExecutorAddr = await liquidationExecutor.getAddress();
  console.log(`    ✓ LiquidationExecutor: ${liquidationExecutorAddr}`);
  deployments.LIQUIDATION_EXECUTOR_ADDRESS = liquidationExecutorAddr;

  // 部署 ArbitrageExecutor
  console.log("  → 部署 ArbitrageExecutor...");
  const ArbitrageExecutor = await hre.ethers.getContractFactory("ArbitrageExecutor");
  const arbitrageExecutor = await ArbitrageExecutor.deploy(
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress
  );
  await arbitrageExecutor.waitForDeployment();
  const arbitrageExecutorAddr = await arbitrageExecutor.getAddress();
  console.log(`    ✓ ArbitrageExecutor: ${arbitrageExecutorAddr}`);
  deployments.ARBITRAGE_EXECUTOR_ADDRESS = arbitrageExecutorAddr;

  // ─── 3. 部署 Reactive Network 合约 ────────────────────────────────────────

  console.log("\n📍 步骤 3/3: 部署 Reactive Network 合约\n");

  await hre.changeNetwork("reactive");

  console.log("  → 部署 RCController...");
  const RCController = await hre.ethers.getContractFactory("RCController");
  const rcController = await RCController.deploy(
    {
      chainId: CHAINS.origin.chainId,
      mockLending: mockLendingAddr,
      mockDexA: mockDexAAddr,
    },
    {
      chainId: CHAINS.destination.chainId,
      liquidationExecutor: liquidationExecutorAddr,
      arbitrageExecutor: arbitrageExecutorAddr,
      mockDexB: mockDexBAddr,
    }
  );
  await rcController.waitForDeployment();
  const rcControllerAddr = await rcController.getAddress();
  console.log(`    ✓ RCController: ${rcControllerAddr}`);
  deployments.RC_CONTROLLER_ADDRESS = rcControllerAddr;

  // ─── 4. 更新 Executor 的 RC Controller 地址 ──────────────────────────────

  console.log("\n📍 步骤 4/4: 更新合约配置\n");

  await hre.changeNetwork("base-sepolia");

  console.log("  → 更新 LiquidationExecutor...");
  const liquidationExecutorContract = await hre.ethers.getContractAt(
    "LiquidationExecutor",
    liquidationExecutorAddr
  );
  await liquidationExecutorContract.updateRCController(rcControllerAddr);
  console.log("    ✓ 已更新");

  console.log("  → 更新 ArbitrageExecutor...");
  const arbitrageExecutorContract = await hre.ethers.getContractAt(
    "ArbitrageExecutor",
    arbitrageExecutorAddr
  );
  await arbitrageExecutorContract.updateRCController(rcControllerAddr);
  console.log("    ✓ 已更新");

  // ─── 5. 保存部署地址到 .env ──────────────────────────────────────────────

  console.log("\n📍 保存部署地址到 .env\n");
  saveDeployments();

  // ─── 完成 ─────────────────────────────────────────────────────────────────

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ 部署完成！\n");
  printSummary();
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
  console.log("  ✓ 已更新 .env 文件");
}

function printSummary() {
  console.log("📋 部署摘要：\n");
  console.log("Origin 链（Sepolia）:");
  console.log(`  MockLending:  ${deployments.MOCK_LENDING_ADDRESS}`);
  console.log(`  MockDEX:      ${deployments.MOCK_DEX_A_ADDRESS}`);
  console.log("\nDestination 链（Base Sepolia）:");
  console.log(`  MockDEX:              ${deployments.MOCK_DEX_B_ADDRESS}`);
  console.log(`  LiquidationExecutor:  ${deployments.LIQUIDATION_EXECUTOR_ADDRESS}`);
  console.log(`  ArbitrageExecutor:    ${deployments.ARBITRAGE_EXECUTOR_ADDRESS}`);
  console.log("\nReactive Network:");
  console.log(`  RCController: ${deployments.RC_CONTROLLER_ADDRESS}`);
  console.log("\n💡 提示：地址已保存到 .env 文件");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
