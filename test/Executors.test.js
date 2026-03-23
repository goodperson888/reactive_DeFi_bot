import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("LiquidationExecutor", function () {
  async function deployLiquidationExecutorFixture() {
    const [owner, rcController, vault, user1] = await hre.ethers.getSigners();

    const LiquidationExecutor = await hre.ethers.getContractFactory("LiquidationExecutor");
    const executor = await LiquidationExecutor.deploy(rcController.address, vault.address);

    return { executor, owner, rcController, vault, user1 };
  }

  describe("部署", function () {
    it("应该正确设置 RC Controller 和 Vault", async function () {
      const { executor, rcController, vault } = await loadFixture(deployLiquidationExecutorFixture);

      expect(await executor.rcController()).to.equal(rcController.address);
      expect(await executor.vault()).to.equal(vault.address);
    });
  });

  describe("清算执行", function () {
    it("应该允许 RC Controller 执行清算", async function () {
      const { executor, rcController } = await loadFixture(deployLiquidationExecutorFixture);

      const targetChain = 11155111; // Sepolia
      const targetContract = hre.ethers.Wallet.createRandom().address;
      const targetUser = hre.ethers.Wallet.createRandom().address;
      const debtAmount = 1000e6;

      await expect(
        executor.connect(rcController).executeLiquidation(
          targetChain,
          targetContract,
          targetUser,
          debtAmount
        )
      )
        .to.emit(executor, "LiquidationExecuted")
        .withArgs(targetUser, debtAmount, 50e6, rcController.address); // 5% profit
    });

    it("非 RC Controller 不能执行清算", async function () {
      const { executor, user1 } = await loadFixture(deployLiquidationExecutorFixture);

      await expect(
        executor.connect(user1).executeLiquidation(11155111, user1.address, user1.address, 1000e6)
      ).to.be.revertedWith("Only RC Controller");
    });

    it("应该正确累计利润", async function () {
      const { executor, rcController } = await loadFixture(deployLiquidationExecutorFixture);

      const debtAmount = 1000e6;
      const expectedProfit = 50e6; // 5%

      await executor.connect(rcController).executeLiquidation(
        11155111,
        rcController.address,
        rcController.address,
        debtAmount
      );

      expect(await executor.totalProfit()).to.equal(expectedProfit);
      expect(await executor.executionCount()).to.equal(1);
    });
  });

  describe("利润提取", function () {
    it("Vault 应该能提取利润", async function () {
      const { executor, rcController, vault } = await loadFixture(deployLiquidationExecutorFixture);

      // 先执行一次清算产生利润
      await executor.connect(rcController).executeLiquidation(
        11155111,
        rcController.address,
        rcController.address,
        1000e6
      );

      // 给合约转入 ETH（模拟利润）
      await rcController.sendTransaction({
        to: await executor.getAddress(),
        value: hre.ethers.parseEther("0.1"),
      });

      const vaultBalanceBefore = await hre.ethers.provider.getBalance(vault.address);

      await executor.connect(vault).withdrawProfit();

      const vaultBalanceAfter = await hre.ethers.provider.getBalance(vault.address);
      expect(vaultBalanceAfter).to.be.gt(vaultBalanceBefore);
    });

    it("RC Controller 应该能提取利润", async function () {
      const { executor, rcController } = await loadFixture(deployLiquidationExecutorFixture);

      await executor.connect(rcController).executeLiquidation(
        11155111,
        rcController.address,
        rcController.address,
        1000e6
      );

      await expect(executor.connect(rcController).withdrawProfit()).to.not.be.reverted;
    });

    it("其他地址不能提取利润", async function () {
      const { executor, user1 } = await loadFixture(deployLiquidationExecutorFixture);

      await expect(executor.connect(user1).withdrawProfit()).to.be.revertedWith("Unauthorized");
    });
  });

  describe("管理功能", function () {
    it("应该允许更新 RC Controller", async function () {
      const { executor, rcController } = await loadFixture(deployLiquidationExecutorFixture);

      const newController = hre.ethers.Wallet.createRandom().address;
      await executor.connect(rcController).updateRCController(newController);

      expect(await executor.rcController()).to.equal(newController);
    });

    it("应该允许更新 Vault", async function () {
      const { executor, rcController } = await loadFixture(deployLiquidationExecutorFixture);

      const newVault = hre.ethers.Wallet.createRandom().address;
      await executor.connect(rcController).updateVault(newVault);

      expect(await executor.vault()).to.equal(newVault);
    });
  });
});

describe("ArbitrageExecutor", function () {
  async function deployArbitrageExecutorFixture() {
    const [owner, rcController, vault, user1] = await hre.ethers.getSigners();

    const ArbitrageExecutor = await hre.ethers.getContractFactory("ArbitrageExecutor");
    const executor = await ArbitrageExecutor.deploy(rcController.address, vault.address);

    return { executor, owner, rcController, vault, user1 };
  }

  describe("部署", function () {
    it("应该正确设置 RC Controller 和 Vault", async function () {
      const { executor, rcController, vault } = await loadFixture(deployArbitrageExecutorFixture);

      expect(await executor.rcController()).to.equal(rcController.address);
      expect(await executor.vault()).to.equal(vault.address);
    });
  });

  describe("套利执行", function () {
    it("应该允许 RC Controller 执行套利", async function () {
      const { executor, rcController } = await loadFixture(deployArbitrageExecutorFixture);

      const dexA = hre.ethers.Wallet.createRandom().address;
      const dexB = hre.ethers.Wallet.createRandom().address;
      const tokenIn = hre.ethers.Wallet.createRandom().address;
      const tokenOut = hre.ethers.Wallet.createRandom().address;
      const amountIn = hre.ethers.parseEther("1");
      const minProfit = hre.ethers.parseEther("0.01");

      await expect(
        executor.connect(rcController).executeArbitrage(
          dexA,
          dexB,
          tokenIn,
          tokenOut,
          amountIn,
          minProfit
        )
      ).to.emit(executor, "ArbitrageExecuted");
    });

    it("非 RC Controller 不能执行套利", async function () {
      const { executor, user1 } = await loadFixture(deployArbitrageExecutorFixture);

      await expect(
        executor.connect(user1).executeArbitrage(
          user1.address,
          user1.address,
          user1.address,
          user1.address,
          hre.ethers.parseEther("1"),
          0
        )
      ).to.be.revertedWith("Only RC Controller");
    });

    it("利润低于阈值时应该失败", async function () {
      const { executor, rcController } = await loadFixture(deployArbitrageExecutorFixture);

      const amountIn = hre.ethers.parseEther("1");
      const minProfit = hre.ethers.parseEther("1"); // 要求 100% 利润（不可能）

      const result = await executor.connect(rcController).executeArbitrage.staticCall(
        rcController.address,
        rcController.address,
        rcController.address,
        rcController.address,
        amountIn,
        minProfit
      );

      expect(result).to.be.false;
    });

    it("应该正确累计利润", async function () {
      const { executor, rcController } = await loadFixture(deployArbitrageExecutorFixture);

      const amountIn = hre.ethers.parseEther("1");
      const expectedProfit = (amountIn * 15n) / 1000n; // 1.5%

      await executor.connect(rcController).executeArbitrage(
        rcController.address,
        rcController.address,
        rcController.address,
        rcController.address,
        amountIn,
        0
      );

      expect(await executor.totalProfit()).to.equal(expectedProfit);
      expect(await executor.executionCount()).to.equal(1);
    });
  });
});
