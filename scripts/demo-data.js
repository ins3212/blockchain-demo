// (Tuỳ chọn, chỉ cho mạng local) Tạo sẵn dữ liệu mẫu để xem giao diện ngay:
//   npx hardhat run scripts/demo-data.js --network localhost
// Kịch bản: An và Bình đăng ký + được duyệt, Chi đăng ký và đang chờ duyệt;
// An, Bình mua cổ phần căn hộ; admin chia tiền thuê; An chuyển 20 cổ phần cho Bình.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { ethers } = require("hardhat");

function readConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "frontend", "config.local.js"), "utf8"), sandbox);
  return sandbox.window.DAPP_CONFIG;
}

const hashDoc = (idNumber, dob) => ethers.keccak256(ethers.toUtf8Bytes(`${idNumber}|${dob}`));

async function main() {
  const cfg = readConfig();
  const [admin, an, binh, chi] = await ethers.getSigners();
  const registry = await ethers.getContractAt("IdentityRegistry", cfg.identity.address);
  const token = await ethers.getContractAt("AssetToken", cfg.asset.address);

  await (await registry.connect(an).register("Nguyễn Văn An", "Việt Nam", hashDoc("001200012345", "2000-05-20"))).wait();
  await (await registry.connect(binh).register("Trần Thị Bình", "Việt Nam", hashDoc("001200067890", "2001-09-02"))).wait();
  await (await registry.connect(chi).register("Lê Minh Chi", "Singapore", hashDoc("S1234567A", "1999-12-31"))).wait();
  await (await registry.connect(admin).verify(an.address)).wait();
  await (await registry.connect(admin).verify(binh.address)).wait();

  const price = (await token.getAssets())[0].pricePerShare;
  await (await token.connect(an).buyShares(0, 120, { value: price * 120n })).wait();
  await (await token.connect(binh).buyShares(0, 80, { value: price * 80n })).wait();
  await (await token.connect(admin).distributeIncome(0, { value: ethers.parseEther("0.05") })).wait();
  await (await token.connect(an).transferShares(0, binh.address, 20)).wait();

  console.log("Đã tạo dữ liệu mẫu. Tài khoản: #0 admin, #1 An, #2 Bình (đã duyệt), #3 Chi (chờ duyệt).");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
