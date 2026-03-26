#!/usr/bin/env node

/**
 * 本地测试脚本 - 不依赖 Hardhat 测试框架
 * 直接使用 Hardhat 的本地网络部署和测试合约
 */

const hre = require("hardhat");

// 测试结果统计
let passed = 0;
let failed = 0;

// 辅助函数
function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

async function testMockLending() {
  console.log("\n📦 测试 MockLending 合约\n");

  const [owner, user1] = await hre.ethers.getSigners();

  // 部署合约
  console.log("1️⃣ 部署合约...");
  const MockLending = await hre.ethers.getContractFactory("MockLending");
  const mockLending = await MockLending.deploy();
  await mockLending.waitForDeployment();
  console.log(`  ✅ 部署成功: ${await mockLending.getAddress()}`);

  // 测试存款
  console.log("\n2️⃣ 测试存款功能...");
  await mockLending.connect(user1).deposit({ value: hre.ethers.parseEther("1.0") });
  const position1 = await mockLending.positions(user1.address);
  assert(
    position1.collateral === hre.ethers.parseEther("1.0"),
    "存款金额正确"
  );

  // 测试借款
  console.log("\n3️⃣ 测试借款功能...");
  await mockLending.connect(user1).borrow(1000e6);
  const position2 = await mockLending.positions(user1.address);
  assert(Number(position2.debt) === 1000e6, "借款金额正确");

  // 测试健康度计算
  console.log("\n4️⃣ 测试健康度计算...");
  const hf = await mockLending.getHealthFactor(user1.address);
  const hfNum = Number(hre.ethers.formatUnits(hf, 18));
  assert(hfNum > 2.0 && hfNum < 2.5, `健康度在合理范围 (${hfNum.toFixed(2)})`);

  // 测试价格变化触发清算
  console.log("\n5️⃣ 测试价格变化和清算...");
  await mockLending.connect(user1).setEthPrice(hre.ethers.parseUnits("2400", 18));
  const newHf = await mockLending.getHealthFactor(user1.address);
  const newHfNum = Number(hre.ethers.formatUnits(newHf, 18));
  assert(newHfNum < 1.0, `价格下跌后健康度 < 1.0 (${newHfNum.toFixed(2)})`);

  // 测试清算
  console.log("\n6️⃣ 测试清算功能...");
  try {
    await mockLending.connect(owner).liquidate(user1.address, 500e6);
    assert(true, "清算执行成功");
  } catch (error) {
    assert(false, `清算失败: ${error.message}`);
  }
}

async function testMockDEX() {
  console.log("\n📦 测试 MockDEX 合约\n");

  const [owner, user1] = await hre.ethers.getSigners();

  // 部署合约
  console.log("1️⃣ 部署合约...");
  const MockDEX = await hre.ethers.getContractFactory("MockDEX");
  const mockDex = await MockDEX.deploy({ value: hre.ethers.parseEther("10") });
  await mockDex.waitForDeployment();
  console.log(`  ✅ 部署成功: ${await mockDex.getAddress()}`);

  // 测试初始流动性
  console.log("\n2️⃣ 测试初始流动性...");
  const ethReserve = await mockDex.ethReserve();
  assert(ethReserve === hre.ethers.parseEther("10"), "ETH 储备正确");

  // 测试添加流动性
  console.log("\n3️⃣ 测试添加流动性...");
  await mockDex.connect(user1).addLiquidity({ value: hre.ethers.parseEther("1") });
  const newEthReserve = await mockDex.ethReserve();
  assert(newEthReserve === hre.ethers.parseEther("11"), "流动性增加正确");

  // 测试 Swap
  console.log("\n4️⃣ 测试 Swap 功能...");
  try {
    await mockDex.connect(user1).swapETHForUSDC({ value: hre.ethers.parseEther("0.1") });
    assert(true, "Swap 执行成功");
  } catch (error) {
    assert(false, `Swap 失败: ${error.message}`);
  }

  // 测试价格设置
  console.log("\n5️⃣ 测试价格设置...");
  await mockDex.setPrice(3500e6);
  const newPrice = await mockDex.getPrice();
  assert(Number(newPrice) === 3500e6, "价格设置正确");
}

async function testExecutors() {
  console.log("\n📦 测试 Executor 合约\n");

  const [owner, rcController, vault] = await hre.ethers.getSigners();

  // 部署 LiquidationExecutor
  console.log("1️⃣ 部署 LiquidationExecutor...");
  const LiquidationExecutor = await hre.ethers.getContractFactory("LiquidationExecutor");
  const liquidationExecutor = await LiquidationExecutor.deploy(
    rcController.address,
    vault.address
  );
  await liquidationExecutor.waitForDeployment();
  console.log(`  ✅ 部署成功: ${await liquidationExecutor.getAddress()}`);

  // 测试清算执行
  console.log("\n2️⃣ 测试清算执行...");
  try {
    await liquidationExecutor
      .connect(rcController)
      .executeLiquidation(11155111, owner.address, owner.address, 1000e6);
    assert(true, "清算执行成功");
  } catch (error) {
    assert(false, `清算执行失败: ${error.message}`);
  }

  // 测试利润累计
  console.log("\n3️⃣ 测试利润累计...");
  const totalProfit = await liquidationExecutor.totalProfit();
  assert(Number(totalProfit) === 50e6, `利润累计正确 (${Number(totalProfit) / 1e6} USDC)`);

  // 部署 ArbitrageExecutor
  console.log("\n4️⃣ 部署 ArbitrageExecutor...");
  const ArbitrageExecutor = await hre.ethers.getContractFactory("ArbitrageExecutor");
  const arbitrageExecutor = await ArbitrageExecutor.deploy(
    rcController.address,
    vault.address
  );
  await arbitrageExecutor.waitForDeployment();
  console.log(`  ✅ 部署成功: ${await arbitrageExecutor.getAddress()}`);

  // 测试套利执行
  console.log("\n5️⃣ 测试套利执行...");
  try {
    await arbitrageExecutor
      .connect(rcController)
      .executeArbitrage(
        owner.address,
        owner.address,
        owner.address,
        owner.address,
        hre.ethers.parseEther("1"),
        0
      );
    assert(true, "套利执行成功");
  } catch (error) {
    assert(false, `套利执行失败: ${error.message}`);
  }
}

async function main() {
  console.log("🧪 开始本地测试\n");
  console.log("=".repeat(60));

  try {
    await testMockLending();
    await testMockDEX();
    await testExecutors();

    console.log("\n" + "=".repeat(60));
    console.log("\n📊 测试结果:");
    console.log(`  ✅ 通过: ${passed}`);
    console.log(`  ❌ 失败: ${failed}`);
    console.log(`  📈 成功率: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

    if (failed === 0) {
      console.log("🎉 所有测试通过！\n");
      process.exit(0);
    } else {
      console.log("⚠️  部分测试失败\n");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ 测试过程中发生错误:");
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
