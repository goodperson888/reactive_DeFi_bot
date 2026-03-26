const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  const balance = await hre.ethers.provider.getBalance(signer.address);

  console.log(`Network: ${network.name} (chainId=${network.chainId.toString()})`);
  console.log(`Address: ${signer.address}`);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
