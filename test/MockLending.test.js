const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("MockLending", function () {
  // 部署 fixture
  async function deployMockLendingFixture() {
    const [owner, user1, user2] = await hre.ethers.getSigners();

    const MockLending = await hre.ethers.getContractFactory("MockLending");
    const mockLending = await MockLending.deploy();

    return { mockLending, owner, user1, user2 };
  }

  describe("存款和借款", function () {
    it("应该允许用户存入抵押品", async function () {
      const { mockLending, user1 } = await loadFixture(deployMockLendingFixture);

      const depositAmount = hre.ethers.parseEther("1.0");
      await mockLending.connect(user1).deposit({ value: depositAmount });

      const position = await mockLending.positions(user1.address);
      expect(position.collateral).to.equal(depositAmount);
    });

    it("应该允许用户借款", async function () {
      const { mockLending, user1 } = await loadFixture(deployMockLendingFixture);

      // 先存入抵押品
      await mockLending.connect(user1).deposit({ value: hre.ethers.parseEther("1.0") });

      // 借款 1000 USDC
      const borrowAmount = 1000e6;
      await mockLending.connect(user1).borrow(borrowAmount);

      const position = await mockLending.positions(user1.address);
      expect(position.debt).to.equal(borrowAmount);
    });

    it("健康度过低时应该拒绝借款", async function () {
      const { mockLending, user1 } = await loadFixture(deployMockLendingFixture);

      // 存入少量抵押品
      await mockLending.connect(user1).deposit({ value: hre.ethers.parseEther("0.1") });

      // 尝试借太多（会导致健康度 < 1）
      const borrowAmount = 500e6; // $500
      await expect(
        mockLending.connect(user1).borrow(borrowAmount)
      ).to.be.revertedWith("Health factor too low");
    });
  });

  describe("健康度计算", function () {
    it("应该正确计算健康度", async function () {
      const { mockLending, user1 } = await loadFixture(deployMockLendingFixture);

      // 存入 1 ETH（价值 $3000）
      await mockLending.connect(user1).deposit({ value: hre.ethers.parseEther("1.0") });

      // 借款 $1000
      await mockLending.connect(user1).borrow(1000e6);

      const hf = await mockLending.getHealthFactor(user1.address);

      // 健康度 = (3000 * 0.8) / 1000 = 2.4
      expect(hf).to.be.closeTo(
        hre.ethers.parseUnits("2.4", 18),
        hre.ethers.parseUnits("0.01", 18) // 允许 0.01 误差
      );
    });

    it("无债务时健康度应该是最大值", async function () {
      const { mockLending, user1 } = await loadFixture(deployMockLendingFixture);

      await mockLending.connect(user1).deposit({ value: hre.ethers.parseEther("1.0") });

      const hf = await mockLending.getHealthFactor(user1.address);
      expect(hf).to.equal(hre.ethers.MaxUint256);
    });
  });

  describe("清算", function () {
    it("健康度 < 1 时应该允许清算", async function () {
      const { mockLending, user1, user2 } = await loadFixture(deployMockLendingFixture);

      // user1 存入抵押品并借款
      await mockLending.connect(user1).deposit({ value: hre.ethers.parseEther("1.0") });
      await mockLending.connect(user1).borrow(2000e6); // $2000

      // 降低 ETH 价格，使健康度 < 1
      await mockLending.connect(user1).setEthPrice(hre.ethers.parseUnits("2400", 18));

      const hfBefore = await mockLending.getHealthFactor(user1.address);
      expect(hfBefore).to.be.lt(hre.ethers.parseUnits("1", 18));

      // user2 执行清算
      await expect(
        mockLending.connect(user2).liquidate(user1.address, 1000e6)
      ).to.emit(mockLending, "Liquidated");
    });

    it("健康度 >= 1 时应该拒绝清算", async function () {
      const { mockLending, user1, user2 } = await loadFixture(deployMockLendingFixture);

      await mockLending.connect(user1).deposit({ value: hre.ethers.parseEther("1.0") });
      await mockLending.connect(user1).borrow(1000e6);

      const hf = await mockLending.getHealthFactor(user1.address);
      expect(hf).to.be.gte(hre.ethers.parseUnits("1", 18));

      await expect(
        mockLending.connect(user2).liquidate(user1.address, 500e6)
      ).to.be.revertedWith("User not liquidatable");
    });
  });

  describe("事件触发", function () {
    it("存款时应该触发 HealthFactorUpdated 事件", async function () {
      const { mockLending, user1 } = await loadFixture(deployMockLendingFixture);

      await expect(
        mockLending.connect(user1).deposit({ value: hre.ethers.parseEther("1.0") })
      ).to.emit(mockLending, "HealthFactorUpdated");
    });

    it("价格变化时应该触发 HealthFactorUpdated 事件", async function () {
      const { mockLending, user1 } = await loadFixture(deployMockLendingFixture);

      await mockLending.connect(user1).deposit({ value: hre.ethers.parseEther("1.0") });
      await mockLending.connect(user1).borrow(1000e6);

      await expect(
        mockLending.connect(user1).setEthPrice(hre.ethers.parseUnits("2500", 18))
      ).to.emit(mockLending, "HealthFactorUpdated");
    });
  });
});
