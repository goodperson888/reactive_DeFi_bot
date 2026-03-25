import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("LiquidationExecutor", function () {
  async function deployFixture() {
    const [owner, rcController, vault, user1] = await hre.ethers.getSigners();

    // 部署 MockLending
    const MockLending = await hre.ethers.getContractFactory("MockLending");
    const lending = await MockLending.deploy();

    // 部署 LiquidationExecutor
    const LiquidationExecutor = await hre.ethers.getContractFactory("LiquidationExecutor");
    const executor = await LiquidationExecutor.deploy(rcController.address, vault.address);

    return { executor, lending, owner, rcController, vault, user1 };
  }

  describe("部署", function () {
    it("应该正确设置 RC Controller 和 Vault", async function () {
      const { executor, rcController, vault } = await loadFixture(deployFixture);
      expect(await executor.rcController()).to.equal(rcController.address);
      expect(await executor.vault()).to.equal(vault.address);
    });
  });

  describe("清算执行", function () {
    it("应该成功清算不健康的仓位", async function () {
      const { executor, lending, rcController, user1 } = await loadFixture(deployFixture);

      // user1 存入 0.5 ETH 抵押品
      await lending.connect(user1).deposit({ value: hre.ethers.parseEther("0.5") });
      // user1 借 1000 USDC
      await lending.connect(user1).borrow(1000e6);
      // 降低 ETH 价格触发清算条件
      await lending.setEthPrice(hre.ethers.parseEther("2400"));

      const hf = await lending.getHealthFactor(user1.address);
      expect(hf).to.be.lt(hre.ethers.parseEther("1"));

      const lendingAddr = await lending.getAddress();
      await expect(
        executor.connect(rcController).executeLiquidation(
          11155111,
          lendingAddr,
          user1.address,
          500e6
        )
      ).to.emit(executor, "LiquidationExecuted");
    });

    it("健康仓位不应被清算", async function () {
      const { executor, lending, rcController, user1 } = await loadFixture(deployFixture);

      await lending.connect(user1).deposit({ value: hre.ethers.parseEther("1") });
      await lending.connect(user1).borrow(100e6);

      const lendingAddr = await lending.getAddress();
      const result = await executor.connect(rcController).executeLiquidation.staticCall(
        11155111,
        lendingAddr,
        user1.address,
        50e6
      );
      expect(result).to.be.false;
    });

    it("非 RC Controller 不能执行清算", async function () {
      const { executor, user1 } = await loadFixture(deployFixture);
      await expect(
        executor.connect(user1).executeLiquidation(11155111, user1.address, user1.address, 1000e6)
      ).to.be.revertedWith("Only RC Controller");
    });
  });

  describe("利润提取", function () {
    it("Vault 应该能提取利润", async function () {
      const { executor, rcController, vault } = await loadFixture(deployFixture);

      // 给合约转入 ETH（模拟清算利润）
      await rcController.sendTransaction({
        to: await executor.getAddress(),
        value: hre.ethers.parseEther("0.1"),
      });

      const vaultBalanceBefore = await hre.ethers.provider.getBalance(vault.address);
      await executor.connect(vault).withdrawProfit();
      const vaultBalanceAfter = await hre.ethers.provider.getBalance(vault.address);
      expect(vaultBalanceAfter).to.be.gt(vaultBalanceBefore);
    });

    it("其他地址不能提取利润", async function () {
      const { executor, user1 } = await loadFixture(deployFixture);
      await expect(executor.connect(user1).withdrawProfit()).to.be.revertedWith("Unauthorized");
    });
  });

  describe("管理功能", function () {
    it("应该允许更新 RC Controller", async function () {
      const { executor, rcController } = await loadFixture(deployFixture);
      const newController = hre.ethers.Wallet.createRandom().address;
      await executor.connect(rcController).updateRCController(newController);
      expect(await executor.rcController()).to.equal(newController);
    });

    it("应该允许更新 Vault", async function () {
      const { executor, rcController } = await loadFixture(deployFixture);
      const newVault = hre.ethers.Wallet.createRandom().address;
      await executor.connect(rcController).updateVault(newVault);
      expect(await executor.vault()).to.equal(newVault);
    });
  });
});

describe("ArbitrageExecutor", function () {
  async function deployFixture() {
    const [owner, rcController, vault, user1] = await hre.ethers.getSigners();

    // 部署两个 MockDEX（模拟不同链上的 DEX）
    const MockDEX = await hre.ethers.getContractFactory("MockDEX");
    const dexA = await MockDEX.deploy({ value: hre.ethers.parseEther("10") });
    const dexB = await MockDEX.deploy({ value: hre.ethers.parseEther("10") });

    const ArbitrageExecutor = await hre.ethers.getContractFactory("ArbitrageExecutor");
    const executor = await ArbitrageExecutor.deploy(rcController.address, vault.address);

    // 给 executor 一些 ETH 作为套利资金
    await owner.sendTransaction({
      to: await executor.getAddress(),
      value: hre.ethers.parseEther("1"),
    });

    return { executor, dexA, dexB, owner, rcController, vault, user1 };
  }

  describe("部署", function () {
    it("应该正确设置 RC Controller 和 Vault", async function () {
      const { executor, rcController, vault } = await loadFixture(deployFixture);
      expect(await executor.rcController()).to.equal(rcController.address);
      expect(await executor.vault()).to.equal(vault.address);
    });
  });

  describe("套利执行", function () {
    it("应该允许 RC Controller 执行套利", async function () {
      const { executor, dexA, dexB, rcController } = await loadFixture(deployFixture);

      // 制造价差：dexA 3000, dexB 3050
      await dexA.setPrice(3000e6);
      await dexB.setPrice(3050e6);

      const dexAAddr = await dexA.getAddress();
      const dexBAddr = await dexB.getAddress();
      const amountIn = hre.ethers.parseEther("0.1");

      await expect(
        executor.connect(rcController).executeArbitrage(
          dexAAddr,
          dexBAddr,
          hre.ethers.ZeroAddress, // ETH
          "0x0000000000000000000000000000000000000001", // USDC
          amountIn,
          0
        )
      ).to.emit(executor, "ArbitrageExecuted");
    });

    it("非 RC Controller 不能执行套利", async function () {
      const { executor, user1 } = await loadFixture(deployFixture);
      await expect(
        executor.connect(user1).executeArbitrage(
          user1.address, user1.address, user1.address, user1.address,
          hre.ethers.parseEther("1"), 0
        )
      ).to.be.revertedWith("Only RC Controller");
    });

    it("dexA 或 dexB 为零地址应该失败", async function () {
      const { executor, rcController } = await loadFixture(deployFixture);
      await expect(
        executor.connect(rcController).executeArbitrage(
          hre.ethers.ZeroAddress, hre.ethers.ZeroAddress,
          hre.ethers.ZeroAddress, hre.ethers.ZeroAddress,
          hre.ethers.parseEther("1"), 0
        )
      ).to.be.revertedWith("Invalid DEX");
    });
  });

  describe("管理功能", function () {
    it("应该允许更新 RC Controller", async function () {
      const { executor, rcController } = await loadFixture(deployFixture);
      const newController = hre.ethers.Wallet.createRandom().address;
      await executor.connect(rcController).updateRCController(newController);
      expect(await executor.rcController()).to.equal(newController);
    });
  });
});
