#!/usr/bin/env node

/**
 * 🧪 本地快速测试脚本
 *
 * 不需要配置 .env，不需要测试币
 * 使用 Hardhat 的本地 EVM 直接测试合约逻辑
 *
 * 运行方式：node test-local.js
 */

const hre = require("hardhat");

console.log("\n🧪 本地测试开始\n");
console.log("=".repeat(60));

let passed = 0;
let failed = 0;

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function assert(condition, message) {
  if (condition) {
    log("✅", message);
    passed++;
  } else {
    log("❌", message);
    failed++;
  }
}

async function main() {
  try {
    const [owner, user1, user2] = await hre.ethers.getSigners();

    // ═══════════════════════════════════════════════════════════
    // 测试 1: MockLending
    // ═══════════════════════════════════════════════════════════

    console.log("\n📦 测试 MockLending 合约\n");

    const MockLending = await hre.ethers.getContractFactory("MockLending");
    const mockLending = await MockLending.deploy();
    await mockLending.waitForDeployment();
    log("✅", `部署成功: ${await mockLending.getAddress()}`);

    // 存款
    await mockLending.connect(user1).deposit({ value: hre.ethers.parseEther("1.0") });
    const pos1 = await mockLending.positions(user1.address);
    assert(pos1.collateral === hre.ethers.parseEther("1.0"), "存款功能正常");

    // 借款
    await mockLending.connect(user1).borrow(1000e6);
    const pos2 = await mockLending.positions(user1.address);
    assert(Number(pos2.debt) === 1000e6, "借款功能正常");

    // 健康度
    const hf = await mockLending.getHealthFactor(user1.address);
    const hfNum = Number(hre.ethers.formatUnits(hf, 18));
    assert(hfNum > 2.0 && hfNum < 2.5, `健康度计算正确 (${hfNum.toFixed(2)})`);

    // 价格变化
    await mockLending.connect(user1).setEthPrice(hre.ethers.parseUnits("2400", 18));
    const newHf = await mockLending.getHealthFactor(user1.address);
    assert(Number(hre.ethers.formatUnits(newHf, 18)) < 1.0, "价格变化触发清算条件");

    // 清算
    await mockLending.connect(user2).liquidate(user1.address, 500e6);
    assert(true, "清算执行成功");

    // ═══════════════════════════════════════════════════════════
    // 测试 2: MockDEX
    // ═══════════════════════════════════════════════════════════

    console.log("\n📦 测试 MockDEX 合约\n");

    const MockDEX = await hre.ethers.getContractFactory("MockDEX");
    const mockDex = await MockDEX.deploy({ value: hre.ethers.parseEther("10") });
    await mockDex.waitForDeployment();
    log("✅", `部署成功: ${await mockDex.getAddress()}`);

    // 初始流动性
    const ethReserve = await mockDex.ethReserve();
    assert(ethReserve === hre.ethers.parseEther("10"), "初始流动性正确");

    // 添加流动性
    await mockDex.connect(user1).addLiquidity({ value: hre.ethers.parseEther("1") });
    const newReserve = await mockDex.ethReserve();
    assert(newReserve === hre.ethers.parseEther("11"), "添加流动性成功");

    // Swap
    await mockDex.connect(user1).swapETHForUSDC({ value: hre.ethers.parseEther("0.1") });
    assert(true, "Swap 执行成功");

    // 价格设置
    await mockDex.setPrice(3500e6);
    const price = await mockDex.getPrice();
    assert(Number(price) === 3500e6, "价格设置成功");

    // ═══════════════════════════════════════════════════════════
    // 测试 3: Executors
    // ═══════════════════════════════════════════════════════════

    console.log("\n📦 测试 Executor 合约\n");

    const LiquidationExecutor = await hre.ethers.getContractFactory("LiquidationExecutor");
    const liquidationExecutor = await LiquidationExecutor.deploy(owner.address, user2.address);
    await liquidationExecutor.waitForDeployment();
    log("✅", `LiquidationExecutor 部署成功`);

    await liquidationExecutor.executeLiquidation(11155111, owner.address, user1.address, 1000e6);
    const profit = await liquidationExecutor.totalProfit();
    assert(Number(profit) === 50e6, `利润累计正确 (${Number(profit) / 1e6} USDC)`);

    const ArbitrageExecutor = await hre.ethers.getContractFactory("ArbitrageExecutor");
    const arbitrageExecutor = await ArbitrageExecutor.deploy(owner.address, user2.address);
    await arbitrageExecutor.waitForDeployment();
    log("✅", `ArbitrageExecutor 部署成功`);

    await arbitrageExecutor.executeArbitrage(
      owner.address, owner.address, owner.address, owner.address,
      hre.ethers.parseEther("1"), 0
    );
    assert(true, "套利执行成功");

    // ═══════════════════════════════════════════════════════════
    // 测试结果
    // ═══════════════════════════════════════════════════════════

    console.log("\n" + "=".repeat(60));
    console.log("\n📊 测试结果:");
    console.log(`  ✅ 通过: ${passed}`);
    console.log(`  ❌ 失败: ${failed}`);
    console.log(`  📈 成功率: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

    if (failed === 0) {
      console.log("🎉 所有测试通过！合约逻辑正确。\n");
      console.log("💡 下一步：");
      console.log("  1. 配置 .env 文件（参考 docs/ENV_SETUP.md）");
      console.log("  2. 获取测试币");
      console.log("  3. 部署到测试网\n");
      process.exit(0);
    } else {
      console.log("⚠️  部分测试失败，请检查合约逻辑\n");
      process.exit(1);
    }

  } catch (error) {
    console.error("\n❌ 测试失败:");
    console.error(error.message);
    process.exit(1);
  }
}

main();
