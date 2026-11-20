// Deploy 2 contract, tạo vài tài sản mẫu và ghi địa chỉ contract cho giao diện web.
//   Local  : npm run deploy:local   (cần `npm run node` đang chạy ở terminal khác)
//   Sepolia: npm run deploy:sepolia (cần file .env)
// Đặt SEED=false để không tạo tài sản mẫu.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const EXPLORERS = { 11155111: "https://sepolia.etherscan.io" };
const NETWORK_NAMES = { 31337: "Hardhat Local", 11155111: "Sepolia Testnet" };

const SAMPLE_ASSETS = [
  ["Căn hộ Sunrise City 2PN", "realestate", "Căn hộ 70m², Quận 7, TP.HCM. Đang cho thuê, thu nhập chia hàng tháng.", 1000, "0.002"],
  ["Vàng miếng SJC 10 lượng", "gold", "Vàng 9999 lưu ký tại kho của đơn vị phát hành, có chứng thư kiểm định.", 100, "0.005"],
  ["Tranh sơn mài \"Phố cổ\"", "art", "Tranh sơn mài 80x120cm của hoạ sĩ Việt Nam, trưng bày tại phòng tranh.", 50, "0.004"],
];

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Mạng: ${network.name} (chainId ${chainId})`);
  console.log(`Ví deploy (admin): ${deployer.address}`);

  const registry = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
  await registry.waitForDeployment();
  const deployBlock = (await registry.deploymentTransaction().wait()).blockNumber;
  console.log(`IdentityRegistry: ${await registry.getAddress()}`);

  const token = await (await ethers.getContractFactory("AssetToken")).deploy(await registry.getAddress());
  await token.waitForDeployment();
  console.log(`AssetToken      : ${await token.getAddress()}`);

  if (process.env.SEED !== "false") {
    for (const [name, category, description, shares, price] of SAMPLE_ASSETS) {
      await (await token.createAsset(name, category, description, shares, ethers.parseEther(price))).wait();
      console.log(`  + Tài sản mẫu: ${name}`);
    }
  }

  const config = {
    chainId,
    networkName: NETWORK_NAMES[chainId] || network.name,
    explorer: EXPLORERS[chainId] || "",
    deployBlock,
    identity: { address: await registry.getAddress() },
    asset: { address: await token.getAddress() },
  };

  // Mạng local -> config.local.js (chỉ dùng trên máy, không commit).
  // Mạng công khai (Sepolia) -> config.js (commit để bản web online dùng được).
  const file = chainId === 31337 ? "config.local.js" : "config.js";
  fs.writeFileSync(
    path.join(__dirname, "..", "frontend", file),
    `// File tự sinh bởi scripts/deploy.js - không sửa tay
window.DAPP_CONFIG = ${JSON.stringify(config, null, 2)};
`
  );
  console.log(`Đã ghi frontend/${file}. Chạy \`npm run serve\` rồi mở http://localhost:5173`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
