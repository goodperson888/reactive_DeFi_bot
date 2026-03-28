import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { Wallet } from "ethers";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env");
const fileEnv = fs.existsSync(envPath)
  ? dotenv.parse(fs.readFileSync(envPath, "utf8"))
  : {};
const frontendEnvPath = path.join(rootDir, "frontend", ".env.local");
const env = { ...process.env, ...fileEnv };
const demoWalletAddress = env.PRIVATE_KEY ? new Wallet(env.PRIVATE_KEY).address : "";

const content = [
  "# Auto-generated from root .env",
  `NEXT_PUBLIC_APP_ENV=${env.APP_ENV || (env.MODE === "prod" ? "testnet" : "local")}`,
  `NEXT_PUBLIC_AUTOMATION_MODE=${env.AUTOMATION_MODE || "reactive"}`,
  `NEXT_PUBLIC_LOCAL_RPC_URL=${env.LOCAL_RPC_URL || "http://127.0.0.1:8545"}`,
  `NEXT_PUBLIC_ORIGIN_RPC_URL=${env.SEPOLIA_RPC_URL || env.SEPOLIA_URL || ""}`,
  `NEXT_PUBLIC_DEST_RPC_URL=${env.BASE_SEPOLIA_RPC_URL || env.BASE_SEPOLIA_URL || ""}`,
  `NEXT_PUBLIC_USER_VAULT_ADDRESS=${env.USER_VAULT_ADDRESS || ""}`,
  `NEXT_PUBLIC_RC_FACTORY_ADDRESS=${env.RC_FACTORY_ADDRESS || ""}`,
  `NEXT_PUBLIC_MOCK_LENDING_ADDRESS=${env.MOCK_LENDING_ADDRESS || ""}`,
  `NEXT_PUBLIC_MOCK_DEX_A_ADDRESS=${env.MOCK_DEX_A_ADDRESS || ""}`,
  `NEXT_PUBLIC_MOCK_DEX_B_ADDRESS=${env.MOCK_DEX_B_ADDRESS || ""}`,
  `NEXT_PUBLIC_DEMO_WALLET_ADDRESS=${demoWalletAddress}`,
  `NEXT_PUBLIC_REACTIVE_RPC_URL=${env.REACTIVE_RPC_URL || "https://lasna-rpc.rnk.dev/"}`,
  "",
].join("\n");

fs.writeFileSync(frontendEnvPath, content);
console.log(`✓ Synced frontend env to ${frontendEnvPath}`);
