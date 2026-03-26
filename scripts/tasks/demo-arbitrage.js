/**
 * Demo script - simulate arbitrage trigger flow.
 * 1) Set different prices on origin and destination MockDEX
 * 2) Execute swap on origin to emit Swap event
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { CONTRACTS, CHAINS } = require("../../config/index.js");

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
  return new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(rpcUrl));
}

function saveTransaction(type, description, txHash) {
  const transactionsPath = path.join(process.cwd(), "TRANSACTIONS.md");
  let content = "";

  if (fs.existsSync(transactionsPath)) {
    content = fs.readFileSync(transactionsPath, "utf8");
  }

  const timestamp = new Date().toISOString();
  const entry = `- [${timestamp}] **${type}**: ${description}\n  - 交易哈希: \`${txHash}\`\n`;

  const typePattern = new RegExp(`^### ${type}$`, "m");
  if (!typePattern.test(content)) {
    content += `\n### ${type}\n\n${entry}`;
  } else {
    content = content.replace(typePattern, `### ${type}\n\n${entry}`);
  }

  fs.writeFileSync(transactionsPath, content);
  console.log("  Transaction saved to TRANSACTIONS.md");
}

async function main() {
  console.log("\nArbitrage demo script\n");
  console.log("=".repeat(60));

  if (!CONTRACTS.origin.mockDexA || !CONTRACTS.destination.mockDexB) {
    throw new Error("Missing mock DEX addresses in .env. Run deployment first.");
  }

  const originWallet = getWallet(CHAINS.origin.rpc);
  const destinationWallet = getWallet(CHAINS.destination.rpc);
  console.log(`Origin wallet: ${originWallet.address}`);
  console.log(`Destination wallet: ${destinationWallet.address}`);

  const mockDexAbi = getArtifact("mocks/MockDEX.sol", "MockDEX").abi;
  const mockDexA = new ethers.Contract(CONTRACTS.origin.mockDexA, mockDexAbi, originWallet);
  const mockDexB = new ethers.Contract(CONTRACTS.destination.mockDexB, mockDexAbi, destinationWallet);

  console.log("\nStep 1: set cross-chain price spread");
  // Origin DexA: 3000 USDC/ETH（便宜，用户在此买入 ETH）
  // Destination DexB: 3050 USDC/ETH（贵，套利者在此卖出 ETH 获利）
  // 差价 1.67% > RCController 阈值 1.5% → 触发套利
  await (await mockDexA.setPrice(3000e6)).wait();
  await (await mockDexB.setPrice(3050e6)).wait();
  const priceA = await mockDexA.getPrice();
  const priceB = await mockDexB.getPrice();
  const spread = ((Number(priceB) - Number(priceA)) / Number(priceA)) * 100;
  console.log(`  Origin DexA price:      ${Number(priceA) / 1e6} USDC/ETH`);
  console.log(`  Destination DexB price: ${Number(priceB) / 1e6} USDC/ETH`);
  console.log(`  Price spread: ${spread.toFixed(2)}% (threshold: 1.5%)`);
  console.log(`  → Spread > threshold: arbitrage will be triggered by RC`);

  console.log("\nStep 2: trigger origin Swap event");
  const swapTx = await mockDexA.swapETHForUSDC({ value: ethers.parseEther("0.001") });
  const receipt = await swapTx.wait();
  console.log(`  Swap tx: ${swapTx.hash}`);

  const parsed = receipt.logs
    .map((log) => {
      try {
        return mockDexA.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((item) => item && item.name === "Swap");

  if (parsed.length > 0) {
    const e = parsed[0];
    console.log("  Swap event parsed:");
    console.log(`    user: ${e.args.user}`);
    console.log(`    amountIn: ${ethers.formatEther(e.args.amountIn)} ETH`);
    console.log(`    amountOut: ${Number(e.args.amountOut) / 1e6} USDC`);
    console.log(`    newPrice: ${Number(e.args.newPrice) / 1e6} USDC/ETH`);
  }

  saveTransaction("Arbitrage Demo - Swap", "Swap on origin chain to trigger arbitrage flow", swapTx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});