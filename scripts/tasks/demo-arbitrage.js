/**
 * Arbitrage demo script.
 *
 * It talks to origin and destination chains through dedicated RPC providers
 * instead of relying on `hre.changeNetwork()`.
 */

import hre from "hardhat";
import { ethers } from "ethers";
import { CONTRACTS, CHAINS } from "../../config/index.js";

const DEMO_KEY = process.env.WALLET_KEY1 || process.env.PRIVATE_KEY || "";

function requireValue(label, value) {
  if (!value) {
    throw new Error(`Missing required config: ${label}`);
  }

  return value;
}

function getWallet(label, rpcUrl) {
  requireValue("WALLET_KEY1 or PRIVATE_KEY", DEMO_KEY);
  requireValue(`${label} RPC`, rpcUrl);
  return new ethers.Wallet(DEMO_KEY, new ethers.JsonRpcProvider(rpcUrl));
}

async function getMockDex(address, signer) {
  requireValue("MockDEX address", address);
  const artifact = await hre.artifacts.readArtifact("MockDEX");
  return new ethers.Contract(address, artifact.abi, signer);
}

async function main() {
  console.log("\nArbitrage demo\n");
  console.log("=".repeat(60));

  const originSigner = getWallet("Sepolia", CHAINS.origin.rpc);
  const destinationSigner = getWallet("Base Sepolia", CHAINS.destination.rpc);
  console.log(`\nUsing account: ${originSigner.address}\n`);

  const mockDexA = await getMockDex(CONTRACTS.origin.mockDexA, originSigner);
  const mockDexB = await getMockDex(CONTRACTS.destination.mockDexB, destinationSigner);

  console.log("Step 1: Set price difference across chains");

  console.log("  -> Origin DEX price: 3000 USDC/ETH");
  await (await mockDexA.setPrice(3000e6)).wait();

  console.log("  -> Destination DEX price: 3050 USDC/ETH");
  await (await mockDexB.setPrice(3050e6)).wait();

  const priceA = await mockDexA.getPrice();
  const priceB = await mockDexB.getPrice();
  const spread = ((Number(priceB) - Number(priceA)) / Number(priceA)) * 100;
  console.log(`  Spread: ${spread.toFixed(2)}%`);

  console.log("\nStep 2: Execute origin-chain swap");
  const swapTx = await mockDexA.swapETHForUSDC({
    value: ethers.parseEther("0.01"),
  });
  const receipt = await swapTx.wait();
  console.log("  Swap complete");

  console.log("\nStep 3: Parse Swap event");
  const events = receipt.logs
    .map((log) => {
      try {
        return mockDexA.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((event) => event && event.name === "Swap");

  if (events.length > 0) {
    const event = events[0];
    console.log("  Swap event detected");
    console.log(`    User: ${event.args.user}`);
    console.log(`    In: ${ethers.formatEther(event.args.amountIn)} ETH`);
    console.log(`    Out: ${Number(event.args.amountOut) / 1e6} USDC`);
    console.log(`    Price: ${Number(event.args.newPrice) / 1e6} USDC/ETH`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("\nDemo complete\n");
  console.log("Next expected flow:");
  console.log("  1. RCController listens for Swap");
  console.log("  2. It detects sufficient spread");
  console.log("  3. It triggers ArbitrageExecutor on Base Sepolia");
  console.log(`\nSwap tx: ${swapTx.hash}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
