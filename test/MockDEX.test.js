const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("MockDEX", function () {
  async function deployMockDEXFixture() {
    const [owner, user1, user2] = await hre.ethers.getSigners();

    const MockDEX = await hre.ethers.getContractFactory("MockDEX");
    const mockDex = await MockDEX.deploy({ value: hre.ethers.parseEther("10") });

    return { mockDex, owner, user1, user2 };
  }

  describe("流动性管理", function () {
    it("部署时应该初始化流动性", async function () {
      const { mockDex } = await loadFixture(deployMockDEXFixture);

      const ethReserve = await mockDex.ethReserve();
      expect(ethReserve).to.equal(hre.ethers.parseEther("10"));

      const usdcReserve = await mockDex.usdcReserve();
      expect(usdcReserve).to.be.gt(0);
    });

    it("应该允许添加流动性", async function () {
      const { mockDex, user1 } = await loadFixture(deployMockDEXFixture);

      const ethReserveBefore = await mockDex.ethReserve();

      await mockDex.connect(user1).addLiquidity({ value: hre.ethers.parseEther("1") });

      const ethReserveAfter = await mockDex.ethReserve();
      expect(ethReserveAfter).to.equal(ethReserveBefore + hre.ethers.parseEther("1"));
    });
  });

  describe("Swap 功能", function () {
    it("应该允许 ETH -> USDC swap", async function () {
      const { mockDex, user1 } = await loadFixture(deployMockDEXFixture);

      const swapAmount = hre.ethers.parseEther("0.1");
      const expectedUSDC = (swapAmount * 3000n * 1000000n) / hre.ethers.parseEther("1");

      await expect(
        mockDex.connect(user1).swapETHForUSDC({ value: swapAmount })
      )
        .to.emit(mockDex, "Swap")
        .withArgs(
          user1.address,
          await mockDex.ETH(),
          await mockDex.USDC(),
          swapAmount,
          expectedUSDC,
          3000000000n // 3000 USDC (6 decimals)
        );
    });

    it("应该允许 USDC -> ETH swap", async function () {
      const { mockDex, user1 } = await loadFixture(deployMockDEXFixture);

      const usdcAmount = 1000e6; // 1000 USDC
      const expectedETH = (BigInt(usdcAmount) * hre.ethers.parseEther("1")) / 3000000000n;

      await expect(
        mockDex.connect(user1).swapUSDCForETH(usdcAmount)
      )
        .to.emit(mockDex, "Swap")
        .withArgs(
          user1.address,
          await mockDex.USDC(),
          await mockDex.ETH(),
          usdcAmount,
          expectedETH,
          3000000000n
        );
    });

    it("流动性不足时应该拒绝 swap", async function () {
      const { mockDex, user1 } = await loadFixture(deployMockDEXFixture);

      // 尝试 swap 超过储备的数量
      const hugeAmount = hre.ethers.parseEther("1000");

      await expect(
        mockDex.connect(user1).swapETHForUSDC({ value: hugeAmount })
      ).to.be.revertedWith("Insufficient liquidity");
    });
  });

  describe("价格管理", function () {
    it("应该允许设置价格", async function () {
      const { mockDex } = await loadFixture(deployMockDEXFixture);

      const newPrice = 3500e6; // 3500 USDC
      await mockDex.setPrice(newPrice);

      const price = await mockDex.getPrice();
      expect(price).to.equal(newPrice);
    });

    it("设置价格时应该触发 LiquidityUpdated 事件", async function () {
      const { mockDex } = await loadFixture(deployMockDEXFixture);

      const newPrice = 3500e6;
      await expect(mockDex.setPrice(newPrice))
        .to.emit(mockDex, "LiquidityUpdated");
    });
  });

  describe("价格查询", function () {
    it("应该正确计算 swap 输出", async function () {
      const { mockDex } = await loadFixture(deployMockDEXFixture);

      const ethAmount = hre.ethers.parseEther("1");
      const expectedUSDC = 3000e6;

      const amountOut = await mockDex.getAmountOut(await mockDex.ETH(), ethAmount);
      expect(amountOut).to.equal(expectedUSDC);
    });
  });
});
