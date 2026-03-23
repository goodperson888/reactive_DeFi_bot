/**
 * 演示脚本 - 模拟套利场景
 *
 * 流程：
 * 1. 在 Origin 链和 Destination 链的 MockDEX 设置不同价格
 * 2. 在 Origin 链执行 Swap，触发价格变化事件
 * 3. RC 监听到价差 > 1.5%，触发套利
 * 4. Destination 链执行套利交易
 *
 * 使用方式：
 * npx hardhat run scripts/tasks/demo-arbitrage.js --network sepolia
 */

import hre from "hardhat";
import { CONTRACTS } from "../../config/index.js";

async function main() {
  console.log("\n🎬 套利演示脚本\n");
  console.log("=".repeat(60));

  const [signer] = await hre.ethers.getSigners();
  console.log(`\n使用账户: ${signer.address}\n`);

  // ─── 步骤 1: 设置价差 ──────────────────────────────────────────────────────

  console.log("📍 步骤 1: 在两条链上设置不同价格");

  // Origin 链 DEX
  await hre.changeNetwork("sepolia");
  const mockDexA = await hre.ethers.getContractAt(
    "MockDEX",
    CONTRACTS.origin.mockDexA
  );

  console.log("  → Origin 链 DEX 设置价格: 3000 USDC/ETH");
  await (await mockDexA.setPrice(3000e6)).wait();

  // Destination 链 DEX
  await hre.changeNetwork("base-sepolia");
  const mockDexB = await hre.ethers.getContractAt(
    "MockDEX",
    CONTRACTS.destination.mockDexB
  );

  console.log("  → Destination 链 DEX 设置价格: 3050 USDC/ETH");
  await (await mockDexB.setPrice(3050e6)).wait();

  const priceA = await mockDexA.getPrice();
  const priceB = await mockDexB.getPrice();
  const spread = ((Number(priceB) - Number(priceA)) / Number(priceA)) * 100;

  console.log(`  ✓ 价差: ${spread.toFixed(2)}%`);

  // ─── 步骤 2: 在 Origin 链执行 Swap ────────────────────────────────────────

  console.log("\n📍 步骤 2: 在 Origin 链执行 Swap（触发事件）");

  await hre.changeNetwork("sepolia");

  const swapTx = await mockDexA.swapETHForUSDC({
    value: hre.ethers.parseEther("0.1"),
  });
  const receipt = await swapTx.wait();
  console.log("  ✓ Swap 完成");

  // ─── 步骤 3: 检查事件 ──────────────────────────────────────────────────────

  console.log("\n📍 步骤 3: 检查 Swap 事件");
  const events = receipt.logs
    .map((log) => {
      try {
        return mockDexA.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.name === "Swap");

  if (events.length > 0) {
    const event = events[0];
    console.log("  ✓ 事件已触发:");
    console.log(`    用户: ${event.args.user}`);
    console.log(`    输入: ${hre.ethers.formatEther(event.args.amountIn)} ETH`);
    console.log(`    输出: ${Number(event.args.amountOut) / 1e6} USDC`);
    console.log(`    价格: ${Number(event.args.newPrice) / 1e6} USDC/ETH`);
  }

  // ─── 总结 ──────────────────────────────────────────────────────────────────

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ 演示完成！\n");
  console.log("💡 下一步：");
  console.log("  1. RC Controller 监听到 Swap 事件");
  console.log("  2. 检测到价差 > 1.5%，触发套利");
  console.log("  3. 跨链调用 Destination 链的 ArbitrageExecutor");
  console.log("  4. 在 Destination 链执行反向交易获利\n");

  console.log("📋 交易哈希（用于比赛提交）:");
  console.log(`  Swap: ${swapTx.hash}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
