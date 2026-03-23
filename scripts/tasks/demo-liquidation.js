/**
 * 演示脚本 - 模拟清算场景
 *
 * 流程：
 * 1. 用户在 MockLending 存入抵押品并借款
 * 2. 手动降低 ETH 价格，触发健康度 < 1.02
 * 3. HealthFactorUpdated 事件被 RC 监听
 * 4. RC 触发 Destination 链执行清算
 *
 * 使用方式：
 * npx hardhat run scripts/tasks/demo-liquidation.js --network sepolia
 */

import hre from "hardhat";
import { CONTRACTS } from "../../config/index.js";

async function main() {
  console.log("\n🎬 清算演示脚本\n");
  console.log("=".repeat(60));

  const [signer] = await hre.ethers.getSigners();
  console.log(`\n使用账户: ${signer.address}\n`);

  // 连接 MockLending 合约
  const mockLending = await hre.ethers.getContractAt(
    "MockLending",
    CONTRACTS.origin.mockLending
  );

  // ─── 步骤 1: 存入抵押品 ────────────────────────────────────────────────────

  console.log("📍 步骤 1: 存入 0.5 ETH 作为抵押品");
  const depositTx = await mockLending.deposit({
    value: hre.ethers.parseEther("0.5"),
  });
  await depositTx.wait();
  console.log("  ✓ 存入成功");

  // ─── 步骤 2: 借款 ──────────────────────────────────────────────────────────

  console.log("\n📍 步骤 2: 借款 1000 USDC");
  const borrowAmount = 1000e6; // 1000 USDC (6 decimals)
  const borrowTx = await mockLending.borrow(borrowAmount);
  await borrowTx.wait();
  console.log("  ✓ 借款成功");

  // 查看当前健康度
  let hf = await mockLending.getHealthFactor(signer.address);
  console.log(`  当前健康度: ${hre.ethers.formatUnits(hf, 18)}`);

  // ─── 步骤 3: 降低 ETH 价格（模拟市场波动）───────────────────────────────

  console.log("\n📍 步骤 3: 降低 ETH 价格（3000 → 2400）");
  const newPrice = hre.ethers.parseUnits("2400", 18);
  const setPriceTx = await mockLending.setEthPrice(newPrice);
  const receipt = await setPriceTx.wait();
  console.log("  ✓ 价格已更新");

  // 查看新的健康度
  hf = await mockLending.getHealthFactor(signer.address);
  const hfFormatted = hre.ethers.formatUnits(hf, 18);
  console.log(`  新健康度: ${hfFormatted}`);

  // ─── 步骤 4: 检查事件 ──────────────────────────────────────────────────────

  console.log("\n📍 步骤 4: 检查 HealthFactorUpdated 事件");
  const events = receipt.logs
    .map((log) => {
      try {
        return mockLending.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.name === "HealthFactorUpdated");

  if (events.length > 0) {
    const event = events[0];
    console.log("  ✓ 事件已触发:");
    console.log(`    用户: ${event.args.user}`);
    console.log(`    健康度: ${hre.ethers.formatUnits(event.args.healthFactor, 18)}`);
    console.log(`    抵押品价值: $${hre.ethers.formatUnits(event.args.totalCollateral, 18)}`);
    console.log(`    债务价值: $${hre.ethers.formatUnits(event.args.totalDebt, 18)}`);
  }

  // ─── 总结 ──────────────────────────────────────────────────────────────────

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ 演示完成！\n");
  console.log("💡 下一步：");
  console.log("  1. RC Controller 会监听到 HealthFactorUpdated 事件");
  console.log("  2. 判断健康度 < 1.02，触发清算");
  console.log("  3. 跨链调用 Destination 链的 LiquidationExecutor");
  console.log("  4. 执行清算并获取奖励\n");

  console.log("📋 交易哈希（用于比赛提交）:");
  console.log(`  存入: ${depositTx.hash}`);
  console.log(`  借款: ${borrowTx.hash}`);
  console.log(`  降价: ${setPriceTx.hash}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
