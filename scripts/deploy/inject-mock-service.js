/**
 * 本地开发专用：将 MockReactiveService 字节码注入到 0xfffFfF
 * 用法：npm run inject:mock-service
 * 前提：Hardhat 节点已在运行（npm run local:node）
 */
import hre from "hardhat";

const SERVICE_ADDRESS = "0x0000000000000000000000000000000000fffFfF";

async function main() {
  const provider = hre.network.provider;

  const existing = await provider.send("eth_getCode", [SERVICE_ADDRESS, "latest"]);
  if (existing !== "0x") {
    console.log(`✓ MockReactiveService 已存在于 ${SERVICE_ADDRESS}（${(existing.length - 2) / 2} bytes）`);
    return;
  }

  console.log(`注入 MockReactiveService 到 ${SERVICE_ADDRESS}...`);
  const artifact = await hre.artifacts.readArtifact("MockReactiveService");
  await provider.send("hardhat_setCode", [SERVICE_ADDRESS, artifact.deployedBytecode]);

  const code = await provider.send("eth_getCode", [SERVICE_ADDRESS, "latest"]);
  if (code === "0x") throw new Error("注入失败，地址仍无代码");
  console.log(`✓ 注入成功，代码大小: ${(code.length - 2) / 2} bytes`);
  console.log(`  现在可以从前端部署 RC 了`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("注入失败:", e.message);
    process.exit(1);
  });
