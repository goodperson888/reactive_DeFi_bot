import "dotenv/config";
import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const frontendEnvPath = path.join(rootDir, "frontend", ".env.local");

const content = [
  "# Auto-generated from root .env",
  `NEXT_PUBLIC_APP_ENV=${process.env.APP_ENV || (process.env.MODE === "prod" ? "testnet" : "local")}`,
  `NEXT_PUBLIC_LOCAL_RPC_URL=${process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545"}`,
  `NEXT_PUBLIC_USER_VAULT_ADDRESS=${process.env.USER_VAULT_ADDRESS || ""}`,
  `NEXT_PUBLIC_RC_FACTORY_ADDRESS=${process.env.RC_FACTORY_ADDRESS || ""}`,
  `NEXT_PUBLIC_REACTIVE_RPC_URL=${process.env.REACTIVE_RPC_URL || "https://kopli-rpc.rkt.ink"}`,
  "",
].join("\n");

fs.writeFileSync(frontendEnvPath, content);
console.log(`✓ Synced frontend env to ${frontendEnvPath}`);
