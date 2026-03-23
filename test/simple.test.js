import { expect } from "chai";
import hre from "hardhat";

describe("简单测试", function () {
  it("应该能获取 signers", async function () {
    const signers = await hre.ethers.getSigners();
    expect(signers.length).to.be.greaterThan(0);
  });

  it("应该能部署 MockLending", async function () {
    const MockLending = await hre.ethers.getContractFactory("MockLending");
    const mockLending = await MockLending.deploy();
    await mockLending.waitForDeployment();

    const address = await mockLending.getAddress();
    expect(address).to.be.properAddress;
  });
});
