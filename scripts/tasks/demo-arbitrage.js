import "dotenv/config";
import fs from "fs";
import path from "path";
import { Contract, JsonRpcProvider, Wallet, formatEther, parseEther } from "ethers";

// Demo spread: buy cheap on Sepolia DEX A, sell rich on Base DEX B.
// 演示价差：Sepolia DEX A 低价买回，Base DEX B 高价卖出。
const BUY_DEX_PRICE = 3000_000000;
const SELL_DEX_PRICE = 3050_000000;
const SWAP_ETH = "0.01";
const ROOT = process.cwd();

function requireEnv(name) {
  // Fail fast for missing env settings.
  // 缺失环境变量时快速失败。
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in .env`);
  }
  return value;
}

function readArtifact(relativePath) {
  // Read compiled artifact from local artifacts directory.
  // 从本地 artifacts 目录读取编译产物。
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function formatUsdc(value) {
  return `${Number(value) / 1e6} USDC`;
}

async function main() {
  // Two RPCs, one wallet key: cross-chain two-leg arbitrage demo.
  // 同一私钥连接两条链：用于跨链两腿套利演示。
  const privateKey = requireEnv("PRIVATE_KEY");
  const sepoliaRpc = requireEnv("SEPOLIA_RPC_URL");
  const baseRpc = requireEnv("BASE_SEPOLIA_RPC_URL");
  const dexAAddress = requireEnv("MOCK_DEX_A_ADDRESS");
  const dexBAddress = requireEnv("MOCK_DEX_B_ADDRESS");

  console.log("\n=== Cross-Chain Arbitrage Demo (Sepolia <-> Base Sepolia) ===\n");

  const artifact = readArtifact("artifacts/contracts/mocks/MockDEX.sol/MockDEX.json");
  const sepoliaWallet = new Wallet(privateKey, new JsonRpcProvider(sepoliaRpc));
  const baseWallet = new Wallet(privateKey, new JsonRpcProvider(baseRpc));

  const dexA = new Contract(dexAAddress, artifact.abi, sepoliaWallet);
  const dexB = new Contract(dexBAddress, artifact.abi, baseWallet);
  // Use pending nonces to avoid collision during fast consecutive txs.
  // 使用 pending nonce，避免快速连续交易产生 nonce 冲突。
  let sepoliaNonce = await sepoliaWallet.getNonce("pending");
  let baseNonce = await baseWallet.getNonce("pending");

  console.log(`Trader: ${sepoliaWallet.address}`);
  console.log(`Sepolia MockDEX A: ${dexAAddress}`);
  console.log(`Base Sepolia MockDEX B: ${dexBAddress}`);

  // Step 1: set synthetic spread on both chains.
  // 第1步：在两条链上设置演示价差。
  console.log("\n1. Set cross-chain price spread");
  const setATx = await dexA.setPrice(BUY_DEX_PRICE, { nonce: sepoliaNonce++ });
  await setATx.wait();
  console.log(`   Sepolia DEX A price tx: ${setATx.hash}`);

  const setBTx = await dexB.setPrice(SELL_DEX_PRICE, { nonce: baseNonce++ });
  await setBTx.wait();
  console.log(`   Base DEX B price tx: ${setBTx.hash}`);

  // Step 2: quote expected round-trip and verify positive edge before execution.
  // 第2步：先做往返报价，并确认存在正向价差再执行。
  const amountIn = parseEther(SWAP_ETH);
  const usdcOut = await dexB.getAmountOut("0x0000000000000000000000000000000000000000", amountIn);
  const ethBack = await dexA.getAmountOut("0x0000000000000000000000000000000000000001", usdcOut);
  const expectedProfit = ethBack > amountIn ? ethBack - amountIn : 0n;

  console.log("\n2. Expected cross-chain round-trip output");
  console.log(`   Base: sell ${SWAP_ETH} ETH -> ${formatUsdc(usdcOut)}`);
  console.log(`   Sepolia: buy back ${formatUsdc(usdcOut)} -> ${formatEther(ethBack)} ETH`);
  console.log(`   synthetic profit -> ${formatEther(expectedProfit)} ETH`);

  if (expectedProfit <= 0n) {
    throw new Error("No positive arbitrage profit with current prices.");
  }

  // Step 3: execute both legs (Base sell ETH->USDC, Sepolia buy back USDC->ETH).
  // 第3步：执行两条套利腿（Base 卖 ETH->USDC，Sepolia 买回 USDC->ETH）。
  console.log("\n3. Execute cross-chain arbitrage legs");
  const baseEthBefore = await baseWallet.provider.getBalance(baseWallet.address);
  const sepoliaEthBefore = await sepoliaWallet.provider.getBalance(sepoliaWallet.address);

  const sellTx = await dexB.swapETHForUSDC({ value: amountIn, nonce: baseNonce++ });
  const sellReceipt = await sellTx.wait();
  console.log(`   Base sell tx: ${sellTx.hash}`);

  const buyTx = await dexA.swapUSDCForETH(usdcOut, { nonce: sepoliaNonce++ });
  const buyReceipt = await buyTx.wait();
  console.log(`   Sepolia buy tx: ${buyTx.hash}`);

  const baseEthAfter = await baseWallet.provider.getBalance(baseWallet.address);
  const sepoliaEthAfter = await sepoliaWallet.provider.getBalance(sepoliaWallet.address);
  const baseGas = sellReceipt.gasUsed * sellReceipt.gasPrice;
  const sepoliaGas = buyReceipt.gasUsed * buyReceipt.gasPrice;

  // Result reports chain-wise ETH delta (excluding gas in each leg).
  // 输出按链统计的 ETH 变化（分别排除本腿 gas）。
  console.log("\n=== Result ===");
  console.log(`Base ETH spent (ex gas): ${formatEther(baseEthBefore - baseEthAfter - baseGas)} ETH`);
  console.log(`Sepolia ETH received (ex gas): ${formatEther(sepoliaEthAfter + sepoliaGas - sepoliaEthBefore)} ETH`);
  console.log(`Cross-chain arbitrage demo succeeded.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
