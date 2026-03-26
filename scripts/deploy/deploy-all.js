/**
 * Full deployment script for:
 * 1) Origin chain (sepolia): MockLending + MockDEX(A)
 * 2) Destination chain (base_sepolia): MockDEX(B) + Executors
 * 3) Reactive chain (lasna): RCController
 *
 * This script uses plain ethers providers and does not rely on hre.changeNetwork().
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { MODE, CHAINS } = require("../../config/index.js");

const deployments = {};

function getProjectRoot() {
  return path.resolve(__dirname, "../..");
}

function getArtifact(contractFile, contractName) {
  const artifactPath = path.join(
    getProjectRoot(),
    "artifacts",
    "contracts",
    contractFile,
    `${contractName}.json`
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}. Run: npx hardhat compile`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

function getWallet(rpcUrl) {
  const raw = process.env.WALLET_KEY1 || process.env.PRIVATE_KEY;
  if (!raw) {
    throw new Error("Missing WALLET_KEY1 or PRIVATE_KEY in .env");
  }
  const privateKey = raw.startsWith("0x") ? raw : `0x${raw}`;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  // NonceManager 在本地维护 nonce 计数，避免多链公共 RPC 负载均衡节点间同步延迟导致 NONCE_EXPIRED
  return new ethers.NonceManager(wallet);
}

async function deployContract(wallet, contractFile, contractName, args = [], overrides = {}) {
  const artifact = getArtifact(contractFile, contractName);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(...args, overrides);
  await contract.waitForDeployment();
  return contract;
}

function saveDeployments() {
  const envPath = path.join(getProjectRoot(), ".env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

  for (const [key, value] of Object.entries(deployments)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `${envContent.endsWith("\n") || envContent.length === 0 ? "" : "\n"}${key}=${value}\n`;
    }
  }

  fs.writeFileSync(envPath, envContent);
}

function printSummary() {
  console.log("\n=== Deployment Summary ===");
  console.log("Origin (sepolia):");
  console.log(`  MockLending: ${deployments.MOCK_LENDING_ADDRESS}`);
  console.log(`  MockDEX A:   ${deployments.MOCK_DEX_A_ADDRESS}`);

  console.log("\nDestination (base_sepolia):");
  console.log(`  MockDEX B:            ${deployments.MOCK_DEX_B_ADDRESS}`);
  console.log(`  LiquidationExecutor:  ${deployments.LIQUIDATION_EXECUTOR_ADDRESS}`);
  console.log(`  ArbitrageExecutor:    ${deployments.ARBITRAGE_EXECUTOR_ADDRESS}`);

  console.log("\nReactive (lasna):");
  console.log(`  RCController: ${deployments.RC_CONTROLLER_ADDRESS}`);
  console.log("\nSaved to .env");
}

async function main() {
  console.log(`\nStarting deployment. MODE=${MODE}`);

  const originWallet = getWallet(CHAINS.origin.rpc);
  const destinationWallet = getWallet(CHAINS.destination.rpc);
  const reactiveWallet = getWallet(CHAINS.reactive.rpc);

  // NonceManager 在 ethers v6 没有同步 .address，使用 getAddress()
  const originAddr      = await originWallet.getAddress();
  const destinationAddr = await destinationWallet.getAddress();
  const reactiveAddr    = await reactiveWallet.getAddress();

  console.log(`Origin deployer: ${originAddr}`);
  console.log(`Destination deployer: ${destinationAddr}`);
  console.log(`Reactive deployer: ${reactiveAddr}`);

  // 1) Deploy origin contracts (sepolia)
  console.log("\n[1/4] Deploying origin contracts on sepolia...");
  const mockLending = await deployContract(
    originWallet,
    "mocks/MockLending.sol",
    "MockLending"
  );
  const mockDexA = await deployContract(
    originWallet,
    "mocks/MockDEX.sol",
    "MockDEX",
    [],
    { value: ethers.parseEther("0.02") }
  );
  deployments.MOCK_LENDING_ADDRESS = await mockLending.getAddress();
  deployments.MOCK_DEX_A_ADDRESS = await mockDexA.getAddress();
  console.log(`  MockLending: ${deployments.MOCK_LENDING_ADDRESS}`);
  console.log(`  MockDEX A:   ${deployments.MOCK_DEX_A_ADDRESS}`);

  // 2) Deploy destination contracts (base_sepolia)
  console.log("\n[2/4] Deploying destination contracts on base_sepolia...");
  const mockDexB = await deployContract(
    destinationWallet,
    "mocks/MockDEX.sol",
    "MockDEX",
    [],
    { value: ethers.parseEther("0.02") }
  );
  deployments.MOCK_DEX_B_ADDRESS = await mockDexB.getAddress();

  // Set temporary RC controller to destination deployer so we can update later.
  const liquidationExecutor = await deployContract(
    destinationWallet,
    "destination/LiquidationExecutor.sol",
    "LiquidationExecutor",
    [destinationAddr, destinationAddr]
  );
  const arbitrageExecutor = await deployContract(
    destinationWallet,
    "destination/ArbitrageExecutor.sol",
    "ArbitrageExecutor",
    [destinationAddr, destinationAddr]
  );

  deployments.LIQUIDATION_EXECUTOR_ADDRESS = await liquidationExecutor.getAddress();
  deployments.ARBITRAGE_EXECUTOR_ADDRESS = await arbitrageExecutor.getAddress();
  console.log(`  MockDEX B:            ${deployments.MOCK_DEX_B_ADDRESS}`);
  console.log(`  LiquidationExecutor:  ${deployments.LIQUIDATION_EXECUTOR_ADDRESS}`);
  console.log(`  ArbitrageExecutor:    ${deployments.ARBITRAGE_EXECUTOR_ADDRESS}`);

  // 3) Deploy reactive contract (lasna)
  console.log("\n[3/4] Deploying RCController on lasna...");
  const rcController = await deployContract(
    reactiveWallet,
    "reactive/RCController.sol",
    "RCController",
    [
      deployments.MOCK_LENDING_ADDRESS,
      deployments.MOCK_DEX_A_ADDRESS,
      deployments.LIQUIDATION_EXECUTOR_ADDRESS,
      deployments.ARBITRAGE_EXECUTOR_ADDRESS,
      deployments.MOCK_DEX_B_ADDRESS,
      ethers.parseUnits("1.02", 18),
      150
    ]
  );
  deployments.RC_CONTROLLER_ADDRESS = await rcController.getAddress();
  console.log(`  RCController: ${deployments.RC_CONTROLLER_ADDRESS}`);

  // 注意：cachedPriceB 通过 demo-arbitrage.js 的 setPrice 直接在 MockDEX B 上设置
  // updateCachedPriceB 已从当前版本 RCController 中移除，无需在此调用

  // 4) Update executors to trust RC controller
  console.log("\n[4/4] Updating executor RC controller addresses on base_sepolia...");
  const liqExecutorAtDest = new ethers.Contract(
    deployments.LIQUIDATION_EXECUTOR_ADDRESS,
    getArtifact("destination/LiquidationExecutor.sol", "LiquidationExecutor").abi,
    destinationWallet
  );
  const arbExecutorAtDest = new ethers.Contract(
    deployments.ARBITRAGE_EXECUTOR_ADDRESS,
    getArtifact("destination/ArbitrageExecutor.sol", "ArbitrageExecutor").abi,
    destinationWallet
  );

  const tx1 = await liqExecutorAtDest.updateRCController(deployments.RC_CONTROLLER_ADDRESS);
  await tx1.wait();
  const tx2 = await arbExecutorAtDest.updateRCController(deployments.RC_CONTROLLER_ADDRESS);
  await tx2.wait();
  console.log("  Executors updated.");

  // 为 ArbitrageExecutor 注入少量 ETH，供套利演示使用（0.02 ETH）
  console.log("\n[4b] Funding ArbitrageExecutor on base_sepolia...");
  const fundTx = await destinationWallet.sendTransaction({
    to: deployments.ARBITRAGE_EXECUTOR_ADDRESS,
    value: ethers.parseEther("0.01"),
  });
  await fundTx.wait();
  console.log(`  ArbitrageExecutor funded: 0.01 ETH`);

  saveDeployments();
  printSummary();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


