const { expect } = require("chai");
const hre = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("LiquidationExecutor", function () {
  async function deployLiquidationFixture() {
    const [owner, rcController, vault, user1] = await hre.ethers.getSigners();
    const LiquidationExecutor = await hre.ethers.getContractFactory("LiquidationExecutor");
    const executor = await LiquidationExecutor.deploy(rcController.address, vault.address);
    await executor.waitForDeployment();
    return { executor, owner, rcController, vault, user1 };
  }

  it("sets RC and vault on deploy", async function () {
    const { executor, rcController, vault } = await loadFixture(deployLiquidationFixture);
    expect(await executor.rcController()).to.equal(rcController.address);
    expect(await executor.vault()).to.equal(vault.address);
  });

  it("allows RC to execute liquidation", async function () {
    const { executor, rcController, user1 } = await loadFixture(deployLiquidationFixture);
    const debtAmount = 1000e6;
    const expectedCollateral = (debtAmount * 105) / 100;

    await expect(
      executor
        .connect(rcController)
        .executeLiquidation(11155111, rcController.address, user1.address, debtAmount)
    )
      .to.emit(executor, "LiquidationExecuted")
      .withArgs(user1.address, debtAmount, expectedCollateral, rcController.address);
  });

  it("rejects non-RC caller", async function () {
    const { executor, user1 } = await loadFixture(deployLiquidationFixture);
    await expect(
      executor
        .connect(user1)
        .executeLiquidation(11155111, user1.address, user1.address, 1000e6)
    ).to.be.revertedWith("Only RC Controller");
  });

  it("accumulates profit and execution count", async function () {
    const { executor, rcController } = await loadFixture(deployLiquidationFixture);
    const debtAmount = 1000e6;
    const expectedProfit = (debtAmount * 5) / 100;

    await executor
      .connect(rcController)
      .executeLiquidation(11155111, rcController.address, rcController.address, debtAmount);

    expect(await executor.totalProfit()).to.equal(expectedProfit);
    expect(await executor.executionCount()).to.equal(1);
  });

  it("allows vault to withdraw ETH balance", async function () {
    const { executor, rcController, vault } = await loadFixture(deployLiquidationFixture);
    await rcController.sendTransaction({
      to: await executor.getAddress(),
      value: hre.ethers.parseEther("0.1"),
    });

    const before = await hre.ethers.provider.getBalance(vault.address);
    await executor.connect(vault).withdrawProfit();
    const after = await hre.ethers.provider.getBalance(vault.address);
    expect(after).to.be.gt(before);
  });
});

describe("ArbitrageExecutor", function () {
  async function deployArbitrageFixture() {
    const [owner, rcController, vault, user1] = await hre.ethers.getSigners();

    const MockDEX = await hre.ethers.getContractFactory("MockDEX");
    const dexA = await MockDEX.deploy({ value: hre.ethers.parseEther("10") });
    await dexA.waitForDeployment();
    const dexB = await MockDEX.deploy({ value: hre.ethers.parseEther("10") });
    await dexB.waitForDeployment();

    const ArbitrageExecutor = await hre.ethers.getContractFactory("ArbitrageExecutor");
    const executor = await ArbitrageExecutor.deploy(rcController.address, vault.address);
    await executor.waitForDeployment();

    // Fund executor so it can perform ETH leg.
    await owner.sendTransaction({
      to: await executor.getAddress(),
      value: hre.ethers.parseEther("1"),
    });

    return { executor, dexA, dexB, owner, rcController, vault, user1 };
  }

  it("sets RC and vault on deploy", async function () {
    const { executor, rcController, vault } = await loadFixture(deployArbitrageFixture);
    expect(await executor.rcController()).to.equal(rcController.address);
    expect(await executor.vault()).to.equal(vault.address);
  });

  it("allows RC to execute arbitrage", async function () {
    const { executor, rcController, dexA, dexB } = await loadFixture(deployArbitrageFixture);

    const amountIn = hre.ethers.parseEther("0.1");
    const minProfit = hre.ethers.parseEther("0.005");

    await expect(
      executor
        .connect(rcController)
        .executeArbitrage(
          await dexA.getAddress(),
          await dexB.getAddress(),
          await executor.ETH(),
          await executor.USDC(),
          amountIn,
          minProfit
        )
    )
      .to.emit(executor, "ArbitrageExecuted")
      .withArgs(
        await dexA.getAddress(),
        await dexB.getAddress(),
        await executor.ETH(),
        amountIn,
        minProfit
      );
  });

  it("rejects non-RC caller", async function () {
    const { executor, user1 } = await loadFixture(deployArbitrageFixture);
    await expect(
      executor
        .connect(user1)
        .executeArbitrage(user1.address, user1.address, user1.address, user1.address, 1, 0)
    ).to.be.revertedWith("Only RC Controller");
  });

  it("accumulates configured minProfit", async function () {
    const { executor, rcController, dexA, dexB } = await loadFixture(deployArbitrageFixture);
    const minProfit = hre.ethers.parseEther("0.003");
    await executor
      .connect(rcController)
      .executeArbitrage(
        await dexA.getAddress(),
        await dexB.getAddress(),
        await executor.ETH(),
        await executor.USDC(),
        hre.ethers.parseEther("0.1"),
        minProfit
      );

    expect(await executor.totalProfit()).to.equal(minProfit);
    expect(await executor.executionCount()).to.equal(1);
  });
});
