/* Chọn chế độ chạy cho giao diện:
   - "Ví thật": dùng MetaMask + contract đã deploy (config.js / config.local.js).
   - "Demo":    dùng blockchain mô phỏng ngay trong trình duyệt (vendor/sim-chain.js), không cần ví,
                không cần ETH. Dữ liệu chỉ nằm trong trình duyệt của người xem (localStorage).
   Demo được bật khi: chưa có contract nào được deploy, hoặc trình duyệt không có MetaMask,
   hoặc địa chỉ trang có ?demo (hay ?demo=2 để vào thẳng vai số 2). Thêm ?wallet để ép dùng ví thật. */
(function () {
  "use strict";
  const query = new URLSearchParams(location.search);
  window.DAPP_HAS_REAL = !!window.DAPP_CONFIG; // có contract thật để chuyển sang dùng MetaMask không?
  if (!window.DAPP_DEMO) return; // cờ này được tính trong index.html

  // Khoá của 5 tài khoản thử nghiệm (khoá công khai, giống bộ tài khoản mặc định của Hardhat)
  const KEYS = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  ];
  const ROLES = ["admin", "an", "binh", "chi", "guest"];
  const C = window.DAPP_CONTRACTS;
  const STORE = "demo.chain." + C.buildId;
  const addresses = KEYS.map((k) => new ethers.Wallet(k).address);

  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* bỏ qua */ } }

  const fromUrl = query.get("demo") || query.get("shim");
  let selected = fromUrl !== null && fromUrl !== "" ? Number(fromUrl) : Number(read("demo.account") || 1);
  if (!(selected >= 0 && selected < KEYS.length)) selected = 1;
  write("demo.account", String(selected));

  const registryAddress = ethers.getCreateAddress({ from: addresses[0], nonce: 0 });
  const tokenAddress = ethers.getCreateAddress({ from: addresses[0], nonce: 1 });
  window.DAPP_CONFIG = {
    chainId: 31337, networkName: "Demo", explorer: "", deployBlock: 0,
    identity: { address: registryAddress }, asset: { address: tokenAddress },
  };

  /** Dữ liệu mẫu ban đầu: 3 tài sản, An & Bình đã xác minh và có cổ phần, Chi đang chờ duyệt. */
  async function seed(chain) {
    const registry = new ethers.Interface(C.IdentityRegistry.abi);
    const token = new ethers.Interface(C.AssetToken.abi);
    const [admin, an, binh, chi] = addresses;
    const eth = ethers.parseEther;
    const docHash = (id, dob) => ethers.keccak256(ethers.toUtf8Bytes(id + "|" + dob));
    const reg = (from, fn, args) => ({ from, to: registryAddress, data: registry.encodeFunctionData(fn, args) });
    const tok = (from, fn, args, value) => ({ from, to: tokenAddress, data: token.encodeFunctionData(fn, args), value: value ? "0x" + value.toString(16) : "0x0" });
    const price = eth("0.002");

    const steps = [
      { from: admin, data: C.IdentityRegistry.bytecode },
      { from: admin, data: C.AssetToken.bytecode + ethers.AbiCoder.defaultAbiCoder().encode(["address"], [registryAddress]).slice(2) },
      tok(admin, "createAsset", ["Căn hộ Sunrise City 2PN", "realestate", "Căn hộ 70m², Quận 7, TP.HCM. Đang cho thuê, thu nhập chia hàng tháng.", 1000, price]),
      tok(admin, "createAsset", ["Vàng miếng SJC 10 lượng", "gold", "Vàng 9999 lưu ký tại kho của đơn vị phát hành, có chứng thư kiểm định.", 100, eth("0.005")]),
      tok(admin, "createAsset", ["Tranh sơn mài \"Phố cổ\"", "art", "Tranh sơn mài 80x120cm của hoạ sĩ Việt Nam, trưng bày tại phòng tranh.", 50, eth("0.004")]),
      reg(an, "register", ["Nguyễn Văn An", "Việt Nam", docHash("001200012345", "2000-05-20")]),
      reg(binh, "register", ["Trần Thị Bình", "Việt Nam", docHash("001200067890", "2001-09-02")]),
      reg(admin, "verify", [an]),
      reg(admin, "verify", [binh]),
      tok(an, "buyShares", [0, 120], price * 120n),
      tok(binh, "buyShares", [0, 80], price * 80n),
      tok(admin, "distributeIncome", [0], eth("0.05")),
      tok(an, "transferShares", [0, binh, 20]),
      reg(chi, "register", ["Lê Minh Chi", "Singapore", docHash("S1234567A", "1999-12-31")]),
    ];
    // Rải các mốc thời gian trong 3 ngày gần đây cho nhật ký trông tự nhiên
    const now = Math.floor(Date.now() / 1000);
    const gap = Math.floor((3 * 86400) / steps.length);
    for (let i = 0; i < steps.length; i++) {
      const receipt = await chain.seed(steps[i], now - (steps.length - i) * gap);
      if (receipt.status !== "0x1") throw new Error("Seed step " + i + " failed");
    }
  }

  async function start() {
    let history = [];
    try { history = JSON.parse(read(STORE) || "[]"); } catch (e) { history = []; }
    const record = [];
    const create = (items) => SimChain.createSimChain({
      privateKeys: KEYS,
      history: items,
      onTransaction(tx) { record.push(tx); write(STORE, JSON.stringify(record)); },
    });

    let chain;
    try {
      chain = await create(history);
      record.push(...history);
    } catch (err) {
      console.warn("Không phát lại được dữ liệu demo cũ, tạo mới.", err);
      history = [];
      chain = await create([]);
    }
    if (!history.length) await seed(chain);
    chain.selectAccount(selected);
    return chain;
  }

  const ready = start();
  ready.catch((err) => console.error("Demo chain failed", err));

  window.DEMO_WALLET = {
    isDemo: true,
    roles: ROLES,
    addresses,
    selected,
    ready,
    request: (args) => ready.then((chain) => chain.request(args)),
    on() {},
    switchAccount(index) {
      write("demo.account", String(index));
      location.href = location.pathname + "?demo";
    },
    reset() {
      try { localStorage.removeItem(STORE); } catch (e) { /* bỏ qua */ }
      location.href = location.pathname + "?demo";
    },
  };
})();
