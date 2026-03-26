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

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { CONTRACTS } = require("../../config/index.js");

// 保存交易哈希到文件
function saveTransaction(type, description, txHash) {
  const transactionsPath = path.join(process.cwd(), "TRANSACTIONS.md");
  let content = "";

  if (fs.existsSync(transactionsPath)) {
    content = fs.readFileSync(transactionsPath, "utf8");
  }

  const timestamp = new Date().toISOString();
  const entry = `- [${timestamp}] **${type}**: ${description}\n  - 交易哈希: \`${txHash}\`\n`;

  // 检查是否已有该类型的章节
  const typePattern = new RegExp(`^### ${type}$`, "m");
  if (!typePattern.test(content)) {
    content += `\n### ${type}\n\n${entry}`;
  } else {
    content = content.replace(typePattern, `### ${type}\n\n${entry}`);
  }

  fs.writeFileSync(transactionsPath, content);
  console.log(`  ✓ 交易已保存到 TRANSACTIONS.md`);
}

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

  console.log("📍 步骤 1: 存入 0.01 ETH 作为抵押品");
  const depositTx = await mockLending.deposit({
    value: hre.ethers.parseEther("0.01"),
  });
  await depositTx.wait();
  console.log("  ✓ 存入成功");

  // ─── 步骤 2: 借款 ──────────────────────────────────────────────────────────

  console.log("\n📍 步骤 2: 借款 20 USDC");
  const borrowAmount = 20e6; // 20 USDC (6 decimals)（与 0.01 ETH 抵押品匹配，初始 HF=1.2）
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

  // 保存交易哈希到文件
  console.log("💾 保存交易记录到 TRANSACTIONS.md...");
  saveTransaction("清算演示 - 存入抵押品", "存入 0.01 ETH 作为抵押品", depositTx.hash);
  saveTransaction("清算演示 - 借款", "借款 20 USDC", borrowTx.hash);
  saveTransaction("清算演示 - 降价", "降低 ETH 价格（3000 → 2400）触发清算", setPriceTx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
  