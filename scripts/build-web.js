// Chuẩn bị các file sinh tự động cho giao diện web (chạy bằng `npm run build:web`):
//   frontend/contracts.js          - ABI + bytecode của 2 contract (đọc từ artifacts/)
//   frontend/vendor/sim-chain.js   - blockchain mô phỏng cho chế độ demo (đóng gói từ web-src/)
//   frontend/vendor/ethers.umd.min.js
// Cần chạy lại mỗi khi sửa contract. Các file này được commit để trang web tĩnh dùng được ngay.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");
const frontend = path.join(root, "frontend");
const artifact = (name) => JSON.parse(fs.readFileSync(path.join(root, "artifacts", "contracts", `${name}.sol`, `${name}.json`), "utf8"));

async function main() {
  const contracts = {};
  for (const name of ["IdentityRegistry", "AssetToken"]) {
    const { abi, bytecode } = artifact(name);
    contracts[name] = { abi, bytecode };
  }
  // buildId đổi khi contract đổi -> chế độ demo tự bỏ dữ liệu cũ không còn tương thích
  contracts.buildId = crypto.createHash("sha256").update(contracts.IdentityRegistry.bytecode + contracts.AssetToken.bytecode).digest("hex").slice(0, 12);
  fs.writeFileSync(
    path.join(frontend, "contracts.js"),
    `// File tự sinh bởi scripts/build-web.js - không sửa tay\nwindow.DAPP_CONTRACTS = ${JSON.stringify(contracts)};\n`
  );

  fs.mkdirSync(path.join(frontend, "vendor"), { recursive: true });
  fs.copyFileSync(path.join(root, "node_modules", "ethers", "dist", "ethers.umd.min.js"), path.join(frontend, "vendor", "ethers.umd.min.js"));

  await esbuild.build({
    entryPoints: [path.join(root, "web-src", "sim-chain.mjs")],
    outfile: path.join(frontend, "vendor", "sim-chain.js"),
    bundle: true,
    minify: true,
    format: "iife",
    globalName: "SimChain",
    platform: "browser",
    target: "es2020",
    legalComments: "none",
    logLevel: "warning",
  });

  if (!fs.existsSync(path.join(frontend, "config.js"))) {
    fs.writeFileSync(path.join(frontend, "config.js"), "// Chưa deploy lên mạng công khai nào. `npm run deploy:sepolia` sẽ ghi đè file này.\nwindow.DAPP_CONFIG = null;\n");
  }
  const size = (f) => (fs.statSync(path.join(frontend, f)).size / 1024).toFixed(0) + " KB";
  console.log(`contracts.js ${size("contracts.js")} (buildId ${contracts.buildId}), vendor/sim-chain.js ${size("vendor/sim-chain.js")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
