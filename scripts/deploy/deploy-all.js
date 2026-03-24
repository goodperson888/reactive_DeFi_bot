/**
 * Deployment script for the full mock flow.
 *
 * It deploys contracts directly with per-chain RPC providers instead of
 * relying on `hre.changeNetwork()`, which is not available in this project.
 */

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { MODE, CHAINS, STRATEGY } from "../../config/index.js";

const deployments = {};
const DEPLOYER_KEY = process.env.WALLET_KEY1 || process.env.PRIVATE_KEY || "";

function requireValue(label, value) {
  if (!value) {
    throw new Error(`Missing required config: ${label}`);
  }

  return value;
}

function getWallet(label, rpcUrl) {
  requireValue("WALLET_KEY1 or PRIVATE_KEY", DEPLOYER_KEY);
  requireValue(`${label} RPC`, rpcUrl);
  const wallet = new ethers.Wallet(DEPLOYER_KEY, new ethers.JsonRpcProvider(rpcUrl));
  return new ethers.NonceManager(wallet);
}

async function getFactory(contractName, signer) {
  const artifact = await hre.artifacts.readArtifact(contractName);
  return new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
}

async function deploy(contractName, signer, args = [], overrides = {}) {
  const factory = await getFactory(contractName, signer);
  const contract = await factory.deploy(...args, overrides);
  await contract.waitForDeployment();
  return contract;
}

function getLiquidationThreshold() {
  return ethers.parseUnits(String(STRATEGY.liquidation.healthFactorThreshold), 18);
}

function getArbitrageSpreadBps() {
  return Math.round(Number(STRATEGY.arbitrage.spreadThreshold) * 100);
}

async function main() {
  console.log(`\nStarting deployment, mode: ${MODE}\n`);
  console.log("=".repeat(60));

  const originSigner = getWallet("Sepolia", CHAINS.origin.rpc);
  const destinationSigner = getWallet("Base Sepolia", CHAINS.destination.rpc);
  const reactiveSigner = getWallet("Reactive (lasna)", CHAINS.reactive.rpc);
  const destinationAddress = await destinationSigner.getAddress();
  const liquidationThreshold = getLiquidationThreshold();
  const arbitrageSpreadBps = getArbitrageSpreadBps();

  console.log(`Configured liquidation health factor threshold: ${STRATEGY.liquidation.healthFactorThreshold}`);
  console.log(`Configured arbitrage spread threshold: ${STRATEGY.arbitrage.spreadThreshold}% (${arbitrageSpreadBps} bps)\n`);

  console.log("\nStep 1/4: Deploy origin contracts on Sepolia\n");

  console.log("  -> Deploying MockLending...");
  const mockLending = await deploy("MockLending", originSigner);
  const mockLendingAddr = await mockLending.getAddress();
  console.log(`     MockLending: ${mockLendingAddr}`);
  deployments.MOCK_LENDING_ADDRESS = mockLendingAddr;

  console.log("  -> Deploying MockDEX (origin)...");
  const mockDexA = await deploy("MockDEX", originSigner, [], {
    // Keep enough origin liquidity for the demo swap while reducing faucet needs.
    value: ethers.parseEther("0.02"),
  });
  const mockDexAAddr = await mockDexA.getAddress();
  console.log(`     MockDEX (origin): ${mockDexAAddr}`);
  deployments.MOCK_DEX_A_ADDRESS = mockDexAAddr;

  console.log("\nStep 2/4: Deploy destination contracts on Base Sepolia\n");

  console.log("  -> Deploying MockDEX (destination)...");
  const mockDexB = await deploy("MockDEX", destinationSigner, [], {
    // Destination DEX only needs a small seed balance for the current demo flow.
    value: ethers.parseEther("0.01"),
  });
  const mockDexBAddr = await mockDexB.getAddress();
  console.log(`     MockDEX (destination): ${mockDexBAddr}`);
  deployments.MOCK_DEX_B_ADDRESS = mockDexBAddr;

  console.log("  -> Deploying LiquidationExecutor...");
  const liquidationExecutor = await deploy("LiquidationExecutor", destinationSigner, [
    destinationAddress,
    ethers.ZeroAddress,
  ]);
  const liquidationExecutorAddr = await liquidationExecutor.getAddress();
  console.log(`     LiquidationExecutor: ${liquidationExecutorAddr}`);
  deployments.LIQUIDATION_EXECUTOR_ADDRESS = liquidationExecutorAddr;

  console.log("  -> Deploying ArbitrageExecutor...");
  const arbitrageExecutor = await deploy("ArbitrageExecutor", destinationSigner, [
    destinationAddress,
    ethers.ZeroAddress,
  ]);
  const arbitrageExecutorAddr = await arbitrageExecutor.getAddress();
  console.log(`     ArbitrageExecutor: ${arbitrageExecutorAddr}`);
  deployments.ARBITRAGE_EXECUTOR_ADDRESS = arbitrageExecutorAddr;

  console.log("\nStep 3/4: Deploy RCController on Reactive Network (lasna)\n");

  console.log("  -> Deploying RCController...");
  const rcController = await deploy("RCController", reactiveSigner, [
    mockLendingAddr,
    mockDexAAddr,
    liquidationExecutorAddr,
    arbitrageExecutorAddr,
    liquidationThreshold,
    arbitrageSpreadBps,
  ]);
  const rcControllerAddr = await rcController.getAddress();
  console.log(`     RCController: ${rcControllerAddr}`);
  deployments.RC_CONTROLLER_ADDRESS = rcControllerAddr;

  console.log("\nStep 4/4: Update destination executors\n");

  console.log("  -> Updating LiquidationExecutor RC controller...");
  await (await liquidationExecutor.connect(destinationSigner).updateRCController(rcControllerAddr)).wait();
  console.log("     LiquidationExecutor updated");

  console.log("  -> Updating ArbitrageExecutor RC controller...");
  await (await arbitrageExecutor.connect(destinationSigner).updateRCController(rcControllerAddr)).wait();
  console.log("     ArbitrageExecutor updated");

  console.log("\nSaving deployment addresses to .env\n");
  saveDeployments();

  console.log("\n" + "=".repeat(60));
  console.log("\nDeployment complete\n");
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
  console.log("  .env updated");
}

function printSummary() {
  console.log("Deployment summary:\n");
  console.log("Origin (Sepolia):");
  console.log(`  MockLending: ${deployments.MOCK_LENDING_ADDRESS}`);
  console.log(`  MockDEX: ${deployments.MOCK_DEX_A_ADDRESS}`);
  console.log("\nDestination (Base Sepolia):");
  console.log(`  MockDEX: ${deployments.MOCK_DEX_B_ADDRESS}`);
  console.log(`  LiquidationExecutor: ${deployments.LIQUIDATION_EXECUTOR_ADDRESS}`);
  console.log(`  ArbitrageExecutor: ${deployments.ARBITRAGE_EXECUTOR_ADDRESS}`);
  console.log("\nReactive Network (lasna):");
  console.log(`  RCController: ${deployments.RC_CONTROLLER_ADDRESS}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
