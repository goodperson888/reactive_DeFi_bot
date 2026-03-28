import "dotenv/config";
import hre from "hardhat";

// Demo defaults for a reproducible liquidation path.
// 演示默认参数：用于稳定复现清算流程。
const COLLATERAL_ETH = "0.05";
const BORROW_USDC = 95_000000;
const HEALTHY_PRICE = "3000";
const TRIGGER_PRICE = "2300";
const TARGET_HF = "0.95";
// Partial liquidation by default (USDC 6 decimals).
// 默认部分清算额度（USDC 为 6 位小数）。
const DEFAULT_DEBT_TO_COVER_USDC = 50_000000;

async function main() {
  // Require deployed lending address from .env.
  // 依赖 .env 中已部署的 MockLending 地址。
  if (!process.env.MOCK_LENDING_ADDRESS) {
    throw new Error("Missing MOCK_LENDING_ADDRESS. Run `npm run deploy:user-flow:testnet` first.");
  }

  console.log("\n=== Same-Chain Liquidation Demo (Sepolia) ===\n");

  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signer available on Sepolia.");
  }

  // Borrower is signer[0], secondary signer is preferred liquidator if funded.
  // 借款人固定为 signer[0]，优先使用第二个签名者作为清算人（若 gas 余额足够）。
  const borrower = signers[0];
  let liquidator = signers[1] || signers[0];
  const minGasBuffer = hre.ethers.parseEther("0.0002");

  if (liquidator.address !== borrower.address) {
    const liquidatorBalance = await hre.ethers.provider.getBalance(liquidator.address);
    if (liquidatorBalance < minGasBuffer) {
      console.log(`Secondary liquidator balance too low (${hre.ethers.formatEther(liquidatorBalance)} ETH), fallback to borrower account.`);
      liquidator = borrower;
    }
  }

  const lendingAsBorrower = await hre.ethers.getContractAt("MockLending", process.env.MOCK_LENDING_ADDRESS, borrower);
  const lendingAsLiquidator = await hre.ethers.getContractAt("MockLending", process.env.MOCK_LENDING_ADDRESS, liquidator);

  console.log(`Borrower: ${borrower.address}`);
  console.log(`Liquidator: ${liquidator.address}`);
  console.log(`MockLending: ${process.env.MOCK_LENDING_ADDRESS}`);

  // Step 0: reset price to healthy zone for deterministic start.
  // 第0步：先将价格重置到健康区间，保证每次演示起点可控。
  console.log(`\n0. Reset price to ${HEALTHY_PRICE} for a clean start`);
  const healthyPriceWei = hre.ethers.parseUnits(HEALTHY_PRICE, 18);
  const preResetTx = await lendingAsBorrower.setEthPrice(healthyPriceWei);
  await preResetTx.wait();
  console.log(`   tx: ${preResetTx.hash}`);

  let position = await lendingAsBorrower.positions(borrower.address);
  console.log(`Before position: collateral=${hre.ethers.formatEther(position.collateral)} ETH, debt=${Number(position.debt) / 1e6} USDC`);

  // Step 1: top up collateral only when existing collateral is insufficient.
  // 第1步：仅在抵押不足时补充抵押，避免重复注资。
  const targetCollateral = hre.ethers.parseEther(COLLATERAL_ETH);
  if (position.collateral < targetCollateral) {
    const needed = targetCollateral - position.collateral;
    console.log(`\n1. Top up collateral by ${hre.ethers.formatEther(needed)} ETH`);
    const depositTx = await lendingAsBorrower.deposit({ value: needed });
    await depositTx.wait();
    console.log(`   tx: ${depositTx.hash}`);
    position = await lendingAsBorrower.positions(borrower.address);
  } else {
    console.log("\n1. Existing collateral is sufficient, skip deposit");
  }

  // Step 2: borrow only when debt is zero to support reruns.
  // 第2步：仅在债务为 0 时借款，支持重复运行脚本。
  if (position.debt === 0n) {
    console.log(`\n2. Borrower borrows ${BORROW_USDC / 1e6} USDC`);
    const borrowTx = await lendingAsBorrower.borrow(BORROW_USDC);
    await borrowTx.wait();
    console.log(`   tx: ${borrowTx.hash}`);
  } else {
    console.log("\n2. Existing debt detected, reuse it");
  }

  // Step 3: evaluate current health factor.
  // 第3步：读取当前健康度（HF）。
  let hf = await lendingAsBorrower.getHealthFactor(borrower.address);
  console.log(`\n3. Health factor after reset: ${hre.ethers.formatUnits(hf, 18)}`);

  // Step 4: adapt trigger price based on current HF, then fallback lower if needed.
  // 第4步：按当前 HF 自适应触发价；若仍不可清算，再进行兜底降价。
  let triggerPriceWei = hre.ethers.parseUnits(TRIGGER_PRICE, 18);
  // Guard: must reach HF < 1 before liquidation.
  // 保护条件：必须达到 HF < 1 才执行清算。
  if (hf >= hre.ethers.parseUnits("1", 18)) {
    const targetHfWei = hre.ethers.parseUnits(TARGET_HF, 18);
    const adaptivePrice = (healthyPriceWei * targetHfWei) / hf;
    if (adaptivePrice > 0n && adaptivePrice < triggerPriceWei) {
      triggerPriceWei = adaptivePrice;
    }
  }

  console.log(
    `\n4. Drop price to ${hre.ethers.formatUnits(triggerPriceWei, 18)} to make the position liquidatable`
  );
  const triggerTx = await lendingAsBorrower.setEthPrice(triggerPriceWei);
  await triggerTx.wait();
  console.log(`   tx: ${triggerTx.hash}`);

  hf = await lendingAsBorrower.getHealthFactor(borrower.address);
  console.log(`   health factor after trigger: ${hre.ethers.formatUnits(hf, 18)}`);

  if (hf >= hre.ethers.parseUnits("1", 18)) {
    const fallbackPrice = (triggerPriceWei * 85n) / 100n;
    console.log(`   still >= 1, fallback price -> ${hre.ethers.formatUnits(fallbackPrice, 18)}`);
    const fallbackTx = await lendingAsBorrower.setEthPrice(fallbackPrice);
    await fallbackTx.wait();
    console.log(`   fallback tx: ${fallbackTx.hash}`);
    hf = await lendingAsBorrower.getHealthFactor(borrower.address);
    console.log(`   health factor after fallback: ${hre.ethers.formatUnits(hf, 18)}`);
  }

  if (hf >= hre.ethers.parseUnits("1", 18)) {
    throw new Error(`Position is still not liquidatable after fallback. Current HF=${hre.ethers.formatUnits(hf, 18)}`);
  }

  // Step 5: execute liquidation and parse emitted Liquidated event.
  // 第5步：执行清算并解析 Liquidated 事件。
  position = await lendingAsBorrower.positions(borrower.address);
  const debtToCover = position.debt < DEFAULT_DEBT_TO_COVER_USDC ? position.debt : DEFAULT_DEBT_TO_COVER_USDC;
  console.log(`\n5. Execute liquidation on Sepolia for ${Number(debtToCover) / 1e6} USDC debt`);

  const liquidatorEthBefore = await hre.ethers.provider.getBalance(liquidator.address);
  const liquidationTx = await lendingAsLiquidator.liquidate(borrower.address, debtToCover);
  const liquidationReceipt = await liquidationTx.wait();
  const gasCost = liquidationReceipt.gasUsed * liquidationReceipt.gasPrice;
  const liquidatorEthAfter = await hre.ethers.provider.getBalance(liquidator.address);
  console.log(`   tx: ${liquidationTx.hash}`);

  const liquidatedEvents = liquidationReceipt.logs
    .map((log) => {
      try {
        return lendingAsLiquidator.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((item) => item && item.name === "Liquidated");

  position = await lendingAsBorrower.positions(borrower.address);
  hf = await lendingAsBorrower.getHealthFactor(borrower.address);

  // Final summary: position delta + liquidator net ETH change (gas adjusted).
  // 最终汇总：仓位变化 + 清算人净 ETH 变化（已扣 gas）。
  console.log("\n=== Result ===");
  console.log(`Borrower collateral after: ${hre.ethers.formatEther(position.collateral)} ETH`);
  console.log(`Borrower debt after: ${Number(position.debt) / 1e6} USDC`);
  console.log(`Borrower health factor after: ${hre.ethers.formatUnits(hf, 18)}`);
  console.log(`Liquidator ETH delta (net gas): ${hre.ethers.formatEther(liquidatorEthAfter + gasCost - liquidatorEthBefore)} ETH`);

  if (liquidatedEvents.length > 0) {
    const event = liquidatedEvents[0];
    console.log(`Liquidated event: user=${event.args.user}, debtRepaid=${Number(event.args.debtRepaid) / 1e6} USDC, collateralSeized=${hre.ethers.formatEther(event.args.collateralSeized)} ETH`);
  }

  console.log("\nSame-chain liquidation succeeded on Sepolia.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
