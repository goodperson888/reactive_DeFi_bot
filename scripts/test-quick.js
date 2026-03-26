const hre = require("hardhat");

async function main() {
  console.log("🧪 快速测试 - MockLending 合约\n");

  const [owner, user1] = await hre.ethers.getSigners();
  console.log("部署账户:", owner.address);

  // 部署 MockLending
  console.log("\n1️⃣ 部署 MockLending...");
  const MockLending = await hre.ethers.getContractFactory("MockLending");
  const mockLending = await MockLending.deploy();
  await mockLending.waitForDeployment();
  console.log("✅ 部署成功:", await mockLending.getAddress());

  // 测试存款
  console.log("\n2️⃣ 测试存款...");
  await mockLending.connect(user1).deposit({ value: hre.ethers.parseEther("1.0") });
  const position1 = await mockLending.positions(user1.address);
  console.log("✅ 存款成功，抵押品:", hre.ethers.formatEther(position1.collateral), "ETH");

  // 测试借款
  console.log("\n3️⃣ 测试借款...");
  await mockLending.connect(user1).borrow(1000e6);
  const position2 = await mockLending.positions(user1.address);
  console.log("✅ 借款成功，债务:", Number(position2.debt) / 1e6, "USDC");

  // 测试健康度
  console.log("\n4️⃣ 测试健康度计算...");
  const hf = await mockLending.getHealthFactor(user1.address);
  console.log("✅ 健康度:", hre.ethers.formatUnits(hf, 18));

  // 测试价格变化
  console.log("\n5️⃣ 测试价格变化触发事件...");
  const tx = await mockLending.connect(user1).setEthPrice(hre.ethers.parseUnits("2400", 18));
  const receipt = await tx.wait();
  console.log("✅ 价格已更新，交易哈希:", tx.hash);

  const newHf = await mockLending.getHealthFactor(user1.address);
  console.log("   新健康度:", hre.ethers.formatUnits(newHf, 18));

  // 检查事件
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
    console.log("✅ HealthFactorUpdated 事件已触发");
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ 所有测试通过！\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
