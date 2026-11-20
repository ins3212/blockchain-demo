// Chạy trọn kịch bản demo bằng GIAO DỊCH THẬT trên testnet (không cần MetaMask):
//   npx hardhat run scripts/sepolia-scenario.js --network sepolia
// Tạo 2 ví người dùng (An, Bình) nếu chưa có, lưu khoá vào .env, cấp ít ETH từ ví admin, rồi:
// đăng ký -> duyệt -> mua cổ phần -> chia thu nhập -> chuyển nhượng -> rút thu nhập.
// Kết quả (mã giao dịch + link Etherscan) được ghi vào docs/sepolia-transactions.json.
// Chạy lại nhiều lần được: bước nào đã làm rồi thì bỏ qua.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { ethers } = require("hardhat");

const root = path.join(__dirname, "..");
const envFile = path.join(root, ".env");

function readConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "frontend", "config.js"), "utf8"), sandbox);
  return sandbox.window.DAPP_CONFIG;
}

function userWallet(envName) {
  let key = process.env[envName];
  if (!key) {
    key = ethers.Wallet.createRandom().privateKey;
    fs.appendFileSync(envFile, `${envName}=${key}\n`);
    process.env[envName] = key;
  }
  return new ethers.Wallet(key, ethers.provider);
}

const hashDoc = (idNumber, dob) => ethers.keccak256(ethers.toUtf8Bytes(`${idNumber}|${dob}`));

async function main() {
  const cfg = readConfig();
  if (!cfg || cfg.chainId === 31337) throw new Error("Chưa deploy lên testnet (frontend/config.js trống).");
  const [admin] = await ethers.getSigners();
  const an = userWallet("USER_AN_KEY");
  const binh = userWallet("USER_BINH_KEY");
  const registry = await ethers.getContractAt("IdentityRegistry", cfg.identity.address);
  const token = await ethers.getContractAt("AssetToken", cfg.asset.address);

  const steps = [];
  async function step(label, send) {
    const tx = await send();
    const receipt = await tx.wait();
    steps.push({ step: label, hash: tx.hash, block: receipt.blockNumber, url: `${cfg.explorer}/tx/${tx.hash}` });
    console.log(`✔ ${label}\n    ${cfg.explorer}/tx/${tx.hash}`);
  }

  // Cấp ETH thử nghiệm cho 2 ví người dùng để trả tiền mua cổ phần và phí gas
  for (const [name, wallet] of [["An", an], ["Bình", binh]]) {
    if ((await ethers.provider.getBalance(wallet.address)) < ethers.parseEther("0.003")) {
      await step(`Admin cấp 0,005 ETH thử nghiệm cho ví ${name}`, () => admin.sendTransaction({ to: wallet.address, value: ethers.parseEther("0.005") }));
    }
  }

  // Kiểm chứng quy tắc: ví chưa xác minh không mua được (chỉ chạy thử, không tạo giao dịch)
  const price = (await token.getAssets())[0].pricePerShare;
  let blocked = "";
  if (!(await registry.isVerified(an.address))) {
    try {
      await token.connect(an).buyShares.staticCall(0, 10, { value: price * 10n });
    } catch (err) {
      blocked = err.reason || err.shortMessage || String(err.message);
      console.log(`✔ Ví chưa xác minh bị từ chối mua: "${blocked}"`);
    }
  }

  const status = async (w) => Number((await registry.getIdentity(w.address)).status);
  if ((await status(an)) === 0) await step("An đăng ký danh tính", () => registry.connect(an).register("Nguyễn Văn An", "Việt Nam", hashDoc("001200012345", "2000-05-20")));
  if ((await status(binh)) === 0) await step("Bình đăng ký danh tính", () => registry.connect(binh).register("Trần Thị Bình", "Việt Nam", hashDoc("001200067890", "2001-09-02")));
  if ((await status(an)) === 1) await step("Admin xác minh danh tính của An", () => registry.verify(an.address));
  if ((await status(binh)) === 1) await step("Admin xác minh danh tính của Bình", () => registry.verify(binh.address));

  if ((await token.balanceOf(0, an.address)) === 0n) await step("An mua 120 cổ phần căn hộ", () => token.connect(an).buyShares(0, 120, { value: price * 120n }));
  if ((await token.balanceOf(0, binh.address)) === 0n) await step("Bình mua 80 cổ phần căn hộ", () => token.connect(binh).buyShares(0, 80, { value: price * 80n }));

  if ((await token.getAssets())[0].totalIncome === 0n) {
    await step("Admin chia 0,001 ETH thu nhập cho thuê", () => token.distributeIncome(0, { value: ethers.parseEther("0.001") }));
    await step("An chuyển nhượng 20 cổ phần cho Bình", () => token.connect(an).transferShares(0, binh.address, 20));
  }
  if ((await token.claimableIncome(0, an.address)) > 0n) await step("An rút thu nhập được chia", () => token.connect(an).claimIncome(0));

  // Đọc lại trạng thái trên chuỗi để đối chiếu
  const asset = (await token.getAssets())[0];
  const summary = {
    network: cfg.networkName,
    chainId: cfg.chainId,
    identityRegistry: cfg.identity.address,
    assetToken: cfg.asset.address,
    admin: admin.address,
    an: an.address,
    binh: binh.address,
    unverifiedBuyRejectedWith: blocked || undefined,
    state: {
      anVerified: await registry.isVerified(an.address),
      binhVerified: await registry.isVerified(binh.address),
      anShares: Number(await token.balanceOf(0, an.address)),
      binhShares: Number(await token.balanceOf(0, binh.address)),
      sharesSold: Number(asset.sharesSold),
      totalIncomeEth: ethers.formatEther(asset.totalIncome),
      binhClaimableEth: ethers.formatEther(await token.claimableIncome(0, binh.address)),
    },
  };
  console.log("\nTrạng thái trên chuỗi:", summary.state);

  const out = path.join(root, "docs", "sepolia-transactions.json");
  const previous = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")).transactions || [] : [];
  fs.writeFileSync(out, JSON.stringify({ ...summary, transactions: previous.concat(steps) }, null, 2) + "\n");
  console.log(`Đã ghi ${steps.length} giao dịch mới vào docs/sepolia-transactions.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
