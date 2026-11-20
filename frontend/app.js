/* Giao diện demo: HTML/JS thuần + ethers.js.
   Cấu trúc: state -> refresh() đọc dữ liệu từ contract -> render() vẽ lại màn hình. */
(function () {
  "use strict";

  const CFG = window.DAPP_CONFIG;
  const ABI = window.DAPP_CONTRACTS;
  const DEMO = window.DEMO_WALLET || null; // khác null = đang ở chế độ demo (blockchain mô phỏng)
  const wallet = DEMO || window.ethereum; // "chiếc ví" mà trang sẽ nói chuyện cùng
  const STATUS = ["none", "pending", "verified", "revoked"];
  const CATEGORIES = { realestate: "building", gold: "coins", art: "image", vehicle: "car", other: "box" };
  const TAB_ICONS = { home: "home", identity: "id", assets: "layers", admin: "shield", log: "activity" };
  const COUNTRIES = ["Việt Nam", "Singapore", "Japan", "Korea", "Thailand", "United States", "United Kingdom", "France", "Germany", "Australia"];

  // Bộ icon nét mảnh (SVG nội tuyến, không cần thư viện)
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.5 1.7-2 3-2s2.4.5 3 2M15 10h3M15 14h3"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M2 21h20M8 8h3M8 12h3M8 16h3"/>',
    coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.2-1.4-2.300-3.500-2.700"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
    car: '<path d="M5 16v-5l2-5h10l2 5v5M3 16h18v2H3zM7.500 13h.01M16.500 13h.01"/>',
    box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    cart: '<path d="M3 4h2l2.5 11h10.500l2-8H6.500"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    toggle: '<rect x="3" y="7" width="18" height="10" rx="5"/><circle cx="16" cy="12" r="2.5"/>',
    bank: '<path d="M3 10 12 4l9 6M5 10v8M9.500 10v8M14.500 10v8M19 10v8M3 20h18"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>',
    wallet: '<path d="M4 7a2 2 0 0 1 2-2h12v4"/><path d="M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16 14h.01"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.500-4.500"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    refresh: '<path d="M4 12a8 8 0 0 1 14-5.300L20 8M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-14 5.300L4 16M4 20v-4h4"/>',
    inbox: '<path d="M3 13 6 5h12l3 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
    alert: '<path d="M12 4 2.500 20h19z"/><path d="M12 10v4M12 17h.01"/>',
  };
  const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.box}</svg>`;

  const state = {
    lang: load("lang") || "vi",
    tab: new URLSearchParams(location.search).get("tab") || load("tab") || "home", // ?tab=assets để mở thẳng một trang
    account: null,
    provider: null,
    idc: null, // contract IdentityRegistry
    asc: null, // contract AssetToken
    problem: null, // "nomm" | "wrongnet" | "nocode" | "setup"
    data: null,
    logs: null, // null = chưa tải, "error", hoặc mảng
    check: null, // kết quả tra cứu
  };

  // ---------- Tiện ích ----------
  function load(key) { try { return localStorage.getItem("demo." + key); } catch (e) { return null; } }
  function save(key, value) { try { localStorage.setItem("demo." + key, value); } catch (e) { /* bỏ qua */ } }
  const $ = (sel, root) => (root || document).querySelector(sel);

  function t(key, vars) {
    const dict = window.I18N[state.lang] || window.I18N.vi;
    let s = dict[key] !== undefined ? dict[key] : key;
    if (vars) for (const k in vars) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  }
  function has(key) { return (window.I18N[state.lang] || {})[key] !== undefined; }

  // Dữ liệu đọc từ blockchain do người dùng nhập -> luôn escape trước khi chèn vào HTML
  function esc(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const short = (addr) => addr.slice(0, 6) + "…" + addr.slice(-4);
  const catKey = (c) => (CATEGORIES[c] ? c : "other");

  /** Avatar "blockie": hình 5x5 đối xứng sinh ra từ địa chỉ ví, mỗi ví một hình riêng. */
  function blockie(addr, size) {
    const hexs = addr.toLowerCase().slice(2);
    const hue = parseInt(hexs.slice(0, 4), 16) % 360;
    const hue2 = (hue + 40 + (parseInt(hexs.slice(4, 6), 16) % 120)) % 360;
    let cells = "";
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 3; x++) {
        const v = parseInt(hexs[8 + y * 3 + x], 16);
        if (v % 3 === 0) continue;
        const fill = v % 3 === 1 ? `hsl(${hue} 65% 55%)` : `hsl(${hue2} 70% 60%)`;
        cells += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
        if (x < 2) cells += `<rect x="${4 - x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
      }
    }
    return `<span class="blockie" style="width:${size}px;height:${size}px"><svg viewBox="0 0 5 5" shape-rendering="crispEdges" aria-hidden="true"><rect width="5" height="5" fill="hsl(${hue} 30% 22%)"/>${cells}</svg></span>`;
  }

  function fmtEth(wei) {
    const n = Number(ethers.formatEther(wei));
    return n.toLocaleString(state.lang === "vi" ? "vi-VN" : "en-US", { maximumFractionDigits: 6 }) + " ETH";
  }
  function fmtDate(ts) {
    if (!Number(ts)) return "—";
    return new Date(Number(ts) * 1000).toLocaleString(state.lang === "vi" ? "vi-VN" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  }
  function pct(part, total) {
    if (!Number(total)) return "0";
    return ((Number(part) * 100) / Number(total)).toLocaleString(state.lang === "vi" ? "vi-VN" : "en-US", { maximumFractionDigits: 2 });
  }
  function docHash(idNumber, dob) {
    const normalized = String(idNumber).replace(/\s+/g, "").toUpperCase();
    return ethers.keccak256(ethers.toUtf8Bytes(normalized + "|" + dob));
  }
  function nameOf(addr) {
    const d = state.data;
    if (same(addr, state.account)) return t("you");
    const known = d && d.people[addr.toLowerCase()];
    if (known && known.displayName) return esc(known.displayName);
    if (d && same(addr, d.owner)) return t("role.admin");
    return short(addr);
  }
  const person = (addr) => `<span class="person">${blockie(addr, 20)}<span>${nameOf(addr)}</span></span>`;
  function addrChip(addr) {
    return `<a href="#" class="mono" data-act="copy" data-addr="${addr}" title="${addr}">${short(addr)}</a>`;
  }
  function txLink(hash) {
    return CFG && CFG.explorer ? `<a href="${CFG.explorer}/tx/${hash}" target="_blank" rel="noopener">${t("tx.view")}</a>` : `<span class="mono muted">${hash.slice(0, 12)}…</span>`;
  }
  function badge(statusIndex) {
    const s = STATUS[statusIndex] || "none";
    return `<span class="badge ${s}">${t("status." + s)}</span>`;
  }
  const empty = (text) => `<div class="empty">${icon("inbox")}${text}</div>`;

  // ---------- Toast ----------
  function toast(kind, html, keep) {
    const el = document.createElement("div");
    const set = (k, h) => { el.className = "toast " + k; el.innerHTML = (k === "pending" ? '<span class="spin"></span>' : "") + `<div>${h}</div>`; };
    set(kind, html);
    $("#toasts").appendChild(el);
    const api = { update(k, h, stay) { set(k, h); if (!stay) setTimeout(() => el.remove(), 6000); } };
    if (!keep) setTimeout(() => el.remove(), 5000);
    return api;
  }

  function errorMessage(err) {
    if (!err) return "?";
    if (err.code === "ACTION_REJECTED" || err.code === 4001) return t("err.rejected");
    if (err.code === "INSUFFICIENT_FUNDS") return t("err.funds");
    let reason = err.reason || (err.revert && err.revert.args && err.revert.args[0]);
    if (!reason) {
      const raw = (err.info && err.info.error && err.info.error.message) || err.shortMessage || err.message || "";
      const m = /reverted with reason string '([^']+)'/.exec(raw) || /execution reverted: "?([^"]+)"?/.exec(raw);
      reason = m ? m[1] : raw;
    }
    if (has("rev." + reason)) return t("rev." + reason);
    if (/insufficient funds/i.test(reason)) return t("err.funds");
    return t("err.generic", { msg: esc(String(reason).slice(0, 160)) });
  }

  /** Gửi một giao dịch: chờ ví ký -> chờ ghi vào khối -> tải lại dữ liệu. */
  async function send(okKey, fn) {
    const note = toast("pending", DEMO ? t("tx.mining") : t("tx.confirm"), true);
    try {
      const tx = await fn();
      note.update("pending", `${t("tx.mining")}<br>${txLink(tx.hash)}`, true);
      await tx.wait();
      note.update("ok", `${t(okKey)}<br>${txLink(tx.hash)}`);
      state.logs = null;
      await refresh();
      return true;
    } catch (err) {
      console.error(err);
      note.update("err", errorMessage(err));
      return false;
    }
  }

  // ---------- Kết nối ví ----------
  async function init() {
    if (!CFG || !ABI) { state.problem = "setup"; return render(); }
    if (!wallet) { state.problem = "nomm"; return render(); }

    wallet.on("accountsChanged", () => location.reload());
    wallet.on("chainChanged", () => location.reload());

    render();
    try {
      const accounts = await wallet.request({ method: "eth_accounts" });
      if (accounts && accounts.length) await connect();
    } catch (err) { console.error(err); }
  }

  async function connect() {
    try {
      const accounts = await wallet.request({ method: "eth_requestAccounts" });
      if (!accounts || !accounts.length) return;
      state.provider = new ethers.BrowserProvider(wallet, undefined, DEMO ? { cacheTimeout: -1 } : undefined);
      const signer = await state.provider.getSigner(accounts[0]);
      state.account = await signer.getAddress();

      const network = await state.provider.getNetwork();
      if (Number(network.chainId) !== CFG.chainId) { state.problem = "wrongnet"; return render(); }
      if ((await state.provider.getCode(CFG.identity.address)) === "0x") { state.problem = "nocode"; return render(); }

      state.problem = null;
      state.idc = new ethers.Contract(CFG.identity.address, ABI.IdentityRegistry.abi, signer);
      state.asc = new ethers.Contract(CFG.asset.address, ABI.AssetToken.abi, signer);
      await refresh();
    } catch (err) {
      console.error(err);
      toast("err", errorMessage(err));
    }
  }

  async function switchNetwork() {
    const chainIdHex = "0x" + CFG.chainId.toString(16);
    try {
      await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
    } catch (err) {
      if (CFG.chainId !== 31337) return toast("err", errorMessage(err));
      // Mạng Hardhat local chưa có trong MetaMask -> thêm mới
      try {
        await wallet.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: chainIdHex, chainName: "Hardhat Local", rpcUrls: ["http://127.0.0.1:8545"], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }],
        });
      } catch (err2) { toast("err", errorMessage(err2)); }
    }
  }

  // ---------- Đọc dữ liệu từ contract ----------
  async function refresh() {
    const { idc, asc, account } = state;
    const [owner, amVerifier, users, rawAssets, proceeds, balance, blockNumber] = await Promise.all([
      idc.owner(), idc.isVerifier(account), idc.getUsers(), asc.getAssets(), asc.saleProceeds(), state.provider.getBalance(account), state.provider.getBlockNumber(),
    ]);

    const identities = await Promise.all(users.map((u) => idc.getIdentity(u)));
    const people = {};
    const list = users.map((addr, i) => {
      const id = identities[i];
      const p = {
        address: addr, displayName: id.displayName, country: id.country, docHash: id.docHash, status: Number(id.status),
        registeredAt: id.registeredAt, updatedAt: id.updatedAt, verifiedBy: id.verifiedBy, note: id.note,
      };
      people[addr.toLowerCase()] = p;
      return p;
    });

    const assets = await Promise.all(rawAssets.map(async (a, id) => {
      const [mine, claimable, holderData] = await Promise.all([
        asc.balanceOf(id, account), asc.claimableIncome(id, account), asc.getHolders(id),
      ]);
      const holders = holderData[0].map((addr, i) => ({ address: addr, shares: holderData[1][i] })).filter((h) => h.shares > 0n);
      return {
        id, name: a.name, category: catKey(a.category), description: a.description, totalShares: a.totalShares, sharesSold: a.sharesSold,
        price: a.pricePerShare, saleOpen: a.saleOpen, totalIncome: a.totalIncome, mine, claimable, holders,
      };
    }));

    state.data = {
      owner, isOwner: same(owner, account), isVerifier: amVerifier, users: list, people, assets, proceeds, balance, blockNumber,
      me: people[account.toLowerCase()] || { address: account, status: 0, displayName: "" },
    };
    if (state.tab === "admin" && !canAdmin()) state.tab = "home";
    render();
    if (state.tab === "log") loadLogs();
  }

  const canAdmin = () => !!state.data && (state.data.isOwner || state.data.isVerifier);

  async function loadLogs() {
    if (!state.idc) return;
    try {
      const from = CFG.deployBlock || 0;
      const [a, b] = await Promise.all([state.idc.queryFilter("*", from), state.asc.queryFilter("*", from)]);
      const events = a.concat(b).filter((e) => e.fragment)
        .sort((x, y) => y.blockNumber - x.blockNumber || y.index - x.index).slice(0, 60);
      const blocks = {};
      await Promise.all([...new Set(events.map((e) => e.blockNumber))].map(async (n) => {
        const block = await state.provider.getBlock(n);
        blocks[n] = block ? block.timestamp : 0;
      }));
      state.logs = events.map((e) => ({ name: e.fragment.name, args: e.args, block: e.blockNumber, time: blocks[e.blockNumber], hash: e.transactionHash }));
    } catch (err) {
      console.error(err);
      state.logs = "error";
    }
    if (state.tab === "log") renderView();
  }

  // ---------- Vẽ giao diện ----------
  function render() {
    document.documentElement.lang = state.lang;
    $("#langBtn").textContent = state.lang === "vi" ? "EN" : "VI";
    $("#langBtn").title = t("lang.switch");
    $("#themeBtn").innerHTML = icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon");
    $("#docsLink").innerHTML = `${icon("book")}<span>${t("docs")}</span>`;
    renderWallet();
    renderBanner();
    renderTabs();
    renderView();
    $("#footer").innerHTML = CFG
      ? t("footer", { net: esc(CFG.networkName), id: addrChip(CFG.identity.address), as: addrChip(CFG.asset.address) })
      : "";
  }

  function renderWallet() {
    const d = state.data;
    $("#netChip").innerHTML = d ? `<span class="chip"><span class="pulse"></span>${esc(CFG.networkName)} · #${d.blockNumber}</span>` : "";
    const box = $("#walletBox");
    if (!state.account) {
      box.innerHTML = DEMO || state.problem === "nomm" || state.problem === "setup" ? "" : `<button class="btn sm" data-act="connect">${icon("wallet")}${t("connect")}</button>`;
      return;
    }
    const role = d ? (d.isOwner ? "admin" : d.isVerifier ? "verifier" : "user") : null;
    box.innerHTML = `<div class="chip wallet">${blockie(state.account, 26)}${addrChip(state.account)}
      ${d ? `<span class="bal">${fmtEth(d.balance)}</span>` : ""}
      ${role ? `<span class="tag ${role === "user" ? "" : "admin"}">${t("role." + role)}</span>` : ""}</div>`;
  }

  function renderBanner() {
    let html = "";
    if (DEMO) {
      const roles = DEMO.roles.map((role, i) => `<button class="${i === DEMO.selected ? "on" : ""}" data-act="demoRole" data-index="${i}" title="${DEMO.addresses[i]}">${t("demo.role." + role)}</button>`).join("");
      html += `<div class="banner demo"><div class="row"><span class="demo-label">${t("demo.title")}</span><span class="hint">${t("demo.playAs")}</span><div class="seg">${roles}</div></div>
        <div class="row"><button class="btn sm ghost" data-act="demoReset">${icon("refresh")}${t("demo.reset")}</button>
          ${window.DAPP_HAS_REAL ? `<a class="btn sm ghost" href="?wallet">${icon("wallet")}${t("demo.useWallet")}</a>` : ""}</div></div>`;
    }
    if (state.problem === "wrongnet") {
      html += `<div class="banner warn"><span>${t("net.wrong", { name: esc(CFG.networkName) })}</span>
        <button class="btn sm" data-act="switch">${t("net.switch", { name: esc(CFG.networkName) })}</button></div>`;
    } else if (state.problem === "nocode") {
      html += `<div class="banner warn"><span>${t("net.nocode")}</span></div>`;
    }
    $("#banner").innerHTML = html;
  }

  function renderTabs() {
    const nav = $("#tabs");
    if (!state.data) { nav.innerHTML = ""; return; }
    const pending = state.data.users.filter((u) => u.status === 1).length;
    const tabs = ["home", "identity", "assets"].concat(canAdmin() ? ["admin"] : [], ["log"]);
    nav.innerHTML = tabs.map((id) => `<button class="tab ${state.tab === id ? "active" : ""}" data-act="tab" data-tab="${id}">
      ${icon(TAB_ICONS[id])}<span>${t("tab." + id)}</span>${id === "admin" && state.data.isVerifier && pending ? `<span class="count">${pending}</span>` : ""}</button>`).join("");
  }

  function renderView() {
    const view = $("#view");
    if (state.problem === "setup") { view.innerHTML = notice("alert", t("setup.title"), t("setup.body")); return; }
    if (state.problem === "nomm") {
      view.innerHTML = notice("wallet", t("nomm.title"), t("nomm.body"),
        `<div class="row center"><a class="btn lg" href="https://metamask.io/download/" target="_blank" rel="noopener">${t("nomm.btn")}</a>
          <a class="btn lg ghost" href="?demo">${t("demo.try")}</a></div>`);
      return;
    }
    if (!state.data) {
      view.innerHTML = DEMO ? `<div class="card hero"><span class="spin lg"></span><h2>${t("demo.loading")}</h2><p>${t("demo.loadingHint")}</p></div>` : viewWelcome();
      return;
    }
    const views = { home: viewHome, identity: viewIdentity, assets: viewAssets, admin: viewAdmin, log: viewLog };
    view.innerHTML = (views[state.tab] || viewHome)();
    updateHashPreview();
  }

  function notice(iconName, title, body, extra) {
    return `<div class="card hero"><span class="big-icon">${icon(iconName)}</span><h2>${title}</h2><p>${body}</p>${extra || ""}</div>`;
  }

  // Hình minh hoạ: các khối nối nhau thành chuỗi
  const CHAIN_ART = `<div class="chain-art" aria-hidden="true"><span>#01</span><i></i><span>#02</span><i></i><span class="hot">#03</span><i></i><span>#04</span></div>`;

  function explainCards() {
    const card = (ic, key) => `<div class="card"><div class="explain"><span class="ico">${icon(ic)}</span><div><h3>${t(key + ".t")}</h3><p>${t(key + ".d")}</p></div></div></div>`;
    return `<div class="grid three">${card("id", "explain.id")}${card("layers", "explain.asset")}${card("link", "explain.link")}</div>`;
  }

  function viewWelcome() {
    return `<div class="card hero">${CHAIN_ART}<p class="eyebrow">${t("tagline")}</p><h2>${t("hero.title")}</h2><p>${t("hero.body")}</p>
      <div class="row center"><button class="btn lg" data-act="connect">${icon("wallet")}${t("connect")}</button>
        <a class="btn lg ghost" href="?demo">${t("demo.try")}</a></div><p class="hint mt">${t("hero.note")}</p></div>${explainCards()}`;
  }

  // ----- Tổng quan -----
  function viewHome() {
    const d = state.data;
    const st = d.me.status;
    const ownsShares = d.assets.some((a) => a.mine > 0n);
    const done = [true, st === 1 || st === 2, st === 2, ownsShares];
    const current = done.indexOf(false);
    const steps = [1, 2, 3, 4].map((n, i) => {
      let stateText = done[i] ? t("step.done") : t("step.todo");
      let cta = "";
      if (i === 2 && st === 1) stateText = t("step.wait");
      if (i === current && i === 1) cta = `<button class="btn sm" data-act="tab" data-tab="identity">${t("step2.go")}</button>`;
      if (i === current && i === 3) cta = `<button class="btn sm" data-act="tab" data-tab="assets">${t("step4.go")}</button>`;
      return `<div class="step ${done[i] ? "done" : i === current ? "current" : ""}"><span class="node">${done[i] ? icon("check") : n}</span>
        <h3>${t("step" + n + ".t")}</h3><p>${t("step" + n + ".d")}</p><p class="state">${stateText}</p>${cta}</div>`;
    }).join("");

    const pending = d.users.filter((u) => u.status === 1).length;
    const stats = [
      [d.users.length, t("stat.users")],
      [d.users.filter((u) => u.status === 2).length, t("stat.verified")],
      [d.assets.length, t("stat.assets")],
      [pending, t("stat.pending")],
    ].map(([value, label]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join("");

    const hello = t("home.hello", { name: d.me.displayName ? esc(d.me.displayName) : short(state.account) });
    return `<div class="card hello"><div><p class="eyebrow">${t("tagline")}</p><h2>${hello}</h2>${d.isOwner ? `<p class="hint">${t("home.helloAdmin")}</p>` : ""}</div>
        ${d.isVerifier && pending ? `<button class="btn sm" data-act="tab" data-tab="admin">${t("home.pendingCta")} · ${pending}</button>` : ""}</div>
      <div class="sec"><h2>${t("home.journey")}</h2></div>
      <div class="card"><div class="steps">${steps}</div></div>
      <div class="sec"><h2>${t("home.stats")}</h2></div>
      <div class="stats">${stats}</div>
      <div class="sec"><h2>${t("home.learn")}</h2></div>${explainCards()}`;
  }

  // ----- Danh tính -----
  function idCard(p) {
    return `<div class="idcard">
      <div class="id-head"><span class="eyebrow">${t("id.cardTitle")}</span>${badge(p.status)}</div>
      <div class="id-body">${blockie(p.address, 56)}<div><div class="name">${esc(p.displayName)}</div><div class="hint">${esc(p.country)}</div></div></div>
      <dl><dt>${t("id.wallet")}</dt><dd>${addrChip(p.address)}</dd>
        <dt>${t("id.since")}</dt><dd class="mono">${fmtDate(p.registeredAt)}</dd>
        ${p.status === 2 ? `<dt>${t("id.by")}</dt><dd>${nameOf(p.verifiedBy)}</dd>` : ""}
        <dt>${t("id.doc")}</dt><dd class="mono" title="${p.docHash}">${p.docHash.slice(0, 14)}…${p.docHash.slice(-6)}</dd></dl></div>`;
  }

  function registerForm() {
    return `<form class="form mt" data-form="register">
      <label class="field">${t("f.name")}<input name="name" maxlength="64" required autocomplete="off" placeholder="${t("f.name.h")}"></label>
      <label class="field">${t("f.country")}<select name="country">${COUNTRIES.map((c) => `<option>${c}</option>`).join("")}</select></label>
      <div class="form-grid">
        <label class="field">${t("f.idno")}<input name="idno" required autocomplete="off" placeholder="001200012345"></label>
        <label class="field">${t("f.dob")}<input name="dob" type="date" required></label>
      </div>
      <p class="hint row">${icon("lock")}<span>${t("f.idno.h")}</span></p>
      <div class="hint mono" id="hashPreview"></div>
      <div><button class="btn" type="submit">${t("id.submit")}</button></div>
    </form>`;
  }

  function viewIdentity() {
    const me = state.data.me;
    let mine;
    if (me.status === 0) {
      mine = `<h2>${t("id.register")}</h2><p class="hint">${t("id.registerHint")}</p>${registerForm()}`;
    } else {
      const noteKey = { 1: DEMO ? "id.pendingNoteDemo" : "id.pendingNote", 2: "id.verifiedNote", 3: "id.revokedNote" }[me.status];
      mine = `<h2>${t("id.mine")}</h2><div class="mt">${idCard(me)}</div>
        <p class="result ${me.status === 2 ? "ok" : me.status === 3 ? "bad" : ""} mt">${t(noteKey, { reason: esc(me.note || t("id.noReason")) })}</p>
        ${me.status === 3 ? `<h3 class="mt">${t("id.register")}</h3>${registerForm()}` : ""}`;
    }

    const c = state.check;
    let result = "";
    if (c) {
      result = c.error
        ? `<p class="result bad mt">${t("check.badaddr")}</p>`
        : `<div class="result mt ${c.match === true || (c.match === null && c.status === 2) ? "ok" : c.match === false ? "bad" : ""}">
            <p class="row">${t("check.status", { addr: addrChip(c.address) })} ${badge(c.status)}${c.name ? `<b>${esc(c.name)}</b>` : ""}</p>
            ${c.match === null ? "" : `<p>${t(c.match ? "check.match" : "check.nomatch")}</p>`}</div>`;
    }

    return `<div class="grid two">
      <div class="card">${mine}</div>
      <div>
        <div class="card"><div class="explain"><span class="ico">${icon("lock")}</span><div><h3>${t("id.privacy.t")}</h3><p>${t("id.privacy.d")}</p></div></div></div>
        <div class="card"><h3>${t("check.t")}</h3><p class="hint">${t("check.d")}</p>
          <form class="form mt" data-form="check">
            <label class="field">${t("check.addr")}<input name="address" class="mono" placeholder="0x… (${t("check.addr.h")})" autocomplete="off"></label>
            <div class="form-grid">
              <label class="field">${t("check.idno")}<input name="idno" autocomplete="off"></label>
              <label class="field">${t("check.dob")}<input name="dob" type="date"></label>
            </div>
            <div><button class="btn ghost" type="submit">${icon("search")}${t("check.btn")}</button></div>
          </form>${result}</div>
      </div></div>`;
  }

  function updateHashPreview() {
    const form = $('form[data-form="register"]');
    const out = $("#hashPreview");
    if (!form || !out) return;
    const idno = form.elements.idno.value.trim();
    const dob = form.elements.dob.value;
    out.textContent = idno && dob ? `${t("id.hashPreview")} ${docHash(idno, dob).slice(0, 30)}…` : "";
  }

  // ----- Tài sản -----
  function assetCard(a, canBuy) {
    const left = a.totalShares - a.sharesSold;
    const status = left === 0n ? ["closed", "as.soldout"] : a.saleOpen ? ["open", "as.open"] : ["closed", "as.closed"];
    const holders = a.holders.length
      ? `<table>${a.holders.map((h) => `<tr><td>${person(h.address)}</td><td class="num">${h.shares}</td><td class="num">${pct(h.shares, a.totalShares)}%</td></tr>`).join("")}</table>`
      : `<p class="hint">${t("as.noHolders")}</p>`;
    const buy = left > 0n && a.saleOpen
      ? `<div><form class="inline-form" data-form="buy" data-id="${a.id}">
          <input name="amount" type="number" inputmode="numeric" min="1" max="${left}" value="1" required aria-label="${t("f.amount")}" ${canBuy ? "" : "disabled"}>
          <button class="btn" type="submit" ${canBuy ? "" : "disabled"}>${t("as.buy")}</button></form>
          <div class="cost mt-s" data-cost="${a.id}">${t("as.cost", { eth: fmtEth(a.price) })}</div></div>`
      : "";
    return `<div class="card asset">
      <div class="asset-head"><span class="asset-ico cat-${a.category}">${icon(CATEGORIES[a.category])}</span>
        <div><h3>${esc(a.name)}</h3><div class="row"><span class="hint">${t("cat." + a.category)}</span><span class="badge ${status[0]}">${t(status[1])}</span></div></div></div>
      <p class="desc">${esc(a.description)}</p>
      <div class="facts">
        <div><b>${fmtEth(a.price)}</b><span>${t("as.price")}</span></div>
        <div><b>${fmtEth(a.price * a.totalShares)}</b><span>${t("as.total")}</span></div>
        <div><b>${left}</b><span>${t("as.left")}</span></div>
        <div><b>${fmtEth(a.totalIncome)}</b><span>${t("as.income")}</span></div>
      </div>
      <div><div class="bar"><i style="width:${Number(a.sharesSold * 100n / a.totalShares)}%"></i></div>
        <span class="hint">${t("as.sold", { sold: a.sharesSold, total: a.totalShares, pct: pct(a.sharesSold, a.totalShares) })}</span></div>
      ${a.mine > 0n ? `<div><span class="badge mine">${t("as.youOwn", { n: a.mine, pct: pct(a.mine, a.totalShares) })}</span></div>` : ""}
      ${buy}
      <details><summary>${t("as.holders", { n: a.holders.length })}</summary>${holders}</details>
    </div>`;
  }

  function viewAssets() {
    const d = state.data;
    const verified = d.me.status === 2;
    const mine = d.assets.filter((a) => a.mine > 0n || a.claimable > 0n);

    const needId = verified ? "" : `<div class="banner warn"><div><b>${t("as.needId.t")}</b><div class="hint">${t("as.needId.d")}</div></div>
      <button class="btn sm" data-act="tab" data-tab="identity">${t("as.needId.btn")}</button></div>`;

    let portfolio;
    if (!mine.length) {
      portfolio = empty(t("as.noHoldings"));
    } else {
      const rows = mine.map((a) => `<tr>
        <td class="main"><span class="person"><span class="asset-ico cat-${a.category}" style="width:30px;height:30px;border-radius:8px">${icon(CATEGORIES[a.category])}</span><b>${esc(a.name)}</b></span></td>
        <td class="num" data-label="${t("as.col.shares")}">${a.mine}</td><td class="num" data-label="${t("as.col.own")}">${pct(a.mine, a.totalShares)}%</td>
        <td class="num" data-label="${t("as.col.value")}">${fmtEth(a.mine * a.price)}</td>
        <td class="num" data-label="${t("as.col.income")}"><b>${fmtEth(a.claimable)}</b></td>
        <td class="act"><button class="btn sm ok" data-act="claim" data-id="${a.id}" ${a.claimable > 0n ? "" : "disabled"}>${icon("download")}${t("as.claim")}</button></td></tr>`).join("");
      const holdings = mine.filter((a) => a.mine > 0n);
      const peers = d.users.filter((u) => u.status === 2 && !same(u.address, state.account));
      const transfer = holdings.length ? `<h3 class="mt">${t("as.transfer")}</h3><p class="hint">${t("as.transfer.hint")}</p>
        <form class="form mt" data-form="transfer"><div class="form-grid">
          <label class="field">${t("f.asset")}<select name="asset">${holdings.map((a) => `<option value="${a.id}">${esc(a.name)} (${a.mine})</option>`).join("")}</select></label>
          <label class="field">${t("f.to")}<input name="to" class="mono" list="peers" placeholder="0x…" required autocomplete="off"></label>
          <label class="field">${t("f.amount")}<input name="amount" type="number" inputmode="numeric" min="1" value="1" required></label>
        </div><small class="hint">${t("f.to.h")}</small>
        <datalist id="peers">${peers.map((u) => `<option value="${u.address}">${esc(u.displayName)}</option>`).join("")}</datalist>
        <div><button class="btn ghost" type="submit">${icon("arrow")}${t("as.transfer.btn")}</button></div></form>` : "";
      portfolio = `<div class="table-wrap"><table class="resp"><thead><tr><th>${t("as.col.asset")}</th><th class="num">${t("as.col.shares")}</th><th class="num">${t("as.col.own")}</th>
        <th class="num">${t("as.col.value")}</th><th class="num">${t("as.col.income")}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${transfer}`;
    }

    const market = d.assets.length
      ? `<div class="grid three">${d.assets.map((a) => assetCard(a, verified)).join("")}</div>`
      : `<div class="card">${empty(t("as.none"))}</div>`;

    return `${needId}
      <div class="sec"><h2>${t("as.portfolio")}</h2><span class="hint">${t("as.portfolio.hint")}</span></div>
      <div class="card">${portfolio}</div>
      <div class="sec"><h2>${t("as.market")}</h2><span class="hint">${t("as.market.hint")}</span></div>${market}`;
  }

  // ----- Quản trị -----
  function viewAdmin() {
    const d = state.data;
    let html = "";

    if (d.isVerifier) {
      const order = { 1: 0, 2: 1, 3: 2 };
      const rows = d.users.slice().sort((a, b) => order[a.status] - order[b.status]).map((u) => {
        let actions = "";
        if (u.status === 1) actions += `<button class="btn sm ok" data-act="verify" data-addr="${u.address}">${icon("check")}${t("ad.verify")}</button>`;
        if (u.status === 1 || u.status === 2) {
          actions += `<form class="inline-form" data-form="revoke" data-addr="${u.address}"><input name="reason" placeholder="${t("ad.reason")}" maxlength="80">
            <button class="btn sm danger" type="submit">${t(u.status === 1 ? "ad.reject" : "ad.revoke")}</button></form>`;
        }
        if (u.status === 3) actions = `<span class="hint">${esc(u.note || "")}</span>`;
        return `<tr><td class="main"><span class="person">${blockie(u.address, 30)}<span><b>${esc(u.displayName)}</b><br><span class="hint">${esc(u.country)}</span></span></span></td>
          <td data-label="${t("ad.col.wallet")}">${addrChip(u.address)}</td><td class="mono" data-label="${t("ad.col.date")}">${fmtDate(u.updatedAt)}</td>
          <td data-label="${t("ad.col.status")}">${badge(u.status)}</td><td class="act"><div class="row">${actions}</div></td></tr>`;
      }).join("");
      html += `<div class="sec"><h2>${t("ad.requests")}</h2><span class="hint">${t("ad.requests.hint")}</span></div>
        <div class="card">${d.users.length ? `<div class="table-wrap"><table class="resp"><thead><tr><th>${t("ad.col.person")}</th><th>${t("ad.col.wallet")}</th>
          <th>${t("ad.col.date")}</th><th>${t("ad.col.status")}</th><th>${t("ad.col.action")}</th></tr></thead><tbody>${rows}</tbody></table></div>`
          : empty(t("ad.noUsers"))}</div>`;
    }

    if (d.isOwner) {
      const manageRows = d.assets.map((a) => `<tr><td class="main"><b>${esc(a.name)}</b></td>
        <td class="num" data-label="${t("ad.col.sold")}">${a.sharesSold}/${a.totalShares}</td><td class="num" data-label="${t("ad.col.dist")}">${fmtEth(a.totalIncome)}</td>
        <td class="act"><div class="row"><form class="inline-form" data-form="pay" data-id="${a.id}"><input name="amount" type="number" inputmode="decimal" step="any" min="0" placeholder="0.01 ETH" required ${a.sharesSold > 0n ? "" : "disabled"}>
          <button class="btn sm ok" type="submit" ${a.sharesSold > 0n ? "" : "disabled"}>${t("ad.pay")}</button></form>
          <button class="btn sm ghost" data-act="sale" data-id="${a.id}" data-open="${a.saleOpen ? "0" : "1"}">${t(a.saleOpen ? "ad.close" : "ad.reopen")}</button></div></td></tr>`).join("");

      html += `<div class="sec"><h2>${t("ad.create")}</h2><span class="hint">${t("ad.create.hint")}</span></div>
        <div class="card"><form class="form" data-form="create">
          <div class="form-grid">
            <label class="field">${t("f.aname")}<input name="name" maxlength="64" required autocomplete="off"></label>
            <label class="field">${t("f.cat")}<select name="category">${Object.keys(CATEGORIES).map((c) => `<option value="${c}">${t("cat." + c)}</option>`).join("")}</select></label>
          </div>
          <label class="field">${t("f.desc")}<input name="description" maxlength="200" autocomplete="off"></label>
          <div class="form-grid">
            <label class="field">${t("f.shares")}<input name="shares" type="number" inputmode="numeric" min="1" max="1000000" value="100" required></label>
            <label class="field">${t("f.price")}<input name="price" type="number" inputmode="decimal" step="any" min="0" value="0.001" required></label>
          </div>
          <div><button class="btn" type="submit">${icon("plus")}${t("ad.create.btn")}</button></div></form></div>

        <div class="sec"><h2>${t("ad.manage")}</h2><span class="hint">${t("ad.manage.hint")}</span></div>
        <div class="card">${d.assets.length ? `<div class="table-wrap"><table class="resp"><thead><tr><th>${t("as.col.asset")}</th><th class="num">${t("ad.col.sold")}</th>
          <th class="num">${t("ad.col.dist")}</th><th>${t("ad.col.pay")}</th></tr></thead><tbody>${manageRows}</tbody></table></div>`
          : empty(t("as.none"))}</div>

        <div class="grid two mt">
          <div class="card"><h3>${t("ad.proceeds")}</h3><p class="hint">${t("ad.proceeds.d")}</p>
            <div class="row mt"><b class="mono" style="font-size:1.3rem">${fmtEth(d.proceeds)}</b><span class="spacer"></span>
            <button class="btn sm ok" data-act="withdraw" ${d.proceeds > 0n ? "" : "disabled"}>${icon("bank")}${t("ad.withdraw")}</button></div></div>
          <div class="card"><h3>${t("ad.verifiers")}</h3><p class="hint">${t("ad.verifiers.d")}</p>
            <form class="inline-form mt" data-form="verifier"><input name="address" class="mono" placeholder="0x…" required autocomplete="off">
            <button class="btn sm ghost" type="submit">${t("ad.addVerifier")}</button></form></div>
        </div>`;
    }
    return html;
  }

  // ----- Nhật ký -----
  const LOG_ICONS = {
    IdentityRegistered: "user", IdentityVerified: "check", IdentityRevoked: "ban", VerifierChanged: "shield", AssetCreated: "layers", SharesPurchased: "cart",
    SharesTransferred: "arrow", IncomeDistributed: "coins", IncomeClaimed: "download", SaleStatusChanged: "toggle", ProceedsWithdrawn: "bank",
  };

  function describe(log) {
    const a = log.args;
    const assetName = (id) => { const x = state.data.assets[Number(id)]; return x ? esc(x.name) : "#" + id; };
    switch (log.name) {
      case "IdentityRegistered": return t("log.IdentityRegistered", { user: short(a.user), name: esc(a.displayName) });
      case "IdentityVerified": return t("log.IdentityVerified", { verifier: nameOf(a.verifier), user: nameOf(a.user) });
      case "IdentityRevoked": return t("log.IdentityRevoked", { verifier: nameOf(a.verifier), user: nameOf(a.user), reason: esc(a.reason || "—") });
      case "VerifierChanged": return t("log.VerifierChanged." + (a.enabled ? "on" : "off"), { user: nameOf(a.account) });
      case "AssetCreated": return t("log.AssetCreated", { name: esc(a.name), shares: a.totalShares, price: fmtEth(a.pricePerShare) });
      case "SharesPurchased": return t("log.SharesPurchased", { user: nameOf(a.buyer), amount: a.amount, name: assetName(a.assetId), cost: fmtEth(a.cost) });
      case "SharesTransferred": return t("log.SharesTransferred", { from: nameOf(a.from), to: nameOf(a.to), amount: a.amount, name: assetName(a.assetId) });
      case "IncomeDistributed": return t("log.IncomeDistributed", { amount: fmtEth(a.amount), name: assetName(a.assetId) });
      case "IncomeClaimed": return t("log.IncomeClaimed", { user: nameOf(a.holder), amount: fmtEth(a.amount), name: assetName(a.assetId) });
      case "SaleStatusChanged": return t("log.SaleStatusChanged." + (a.open ? "on" : "off"), { name: assetName(a.assetId) });
      case "ProceedsWithdrawn": return t("log.ProceedsWithdrawn", { amount: fmtEth(a.amount) });
      default: return esc(log.name);
    }
  }

  function viewLog() {
    let body;
    if (state.logs === null) body = `<div class="empty"><span class="spin lg"></span><p>${t("log.loading")}</p></div>`;
    else if (state.logs === "error") body = empty(t("log.error"));
    else if (!state.logs.length) body = empty(t("log.empty"));
    else {
      body = `<ul class="log">${state.logs.map((log) => `<li><span class="node">${icon(LOG_ICONS[log.name])}</span><div>
        <div>${describe(log)}</div>
        <div class="meta">${t("log.block", { n: log.block })} · ${fmtDate(log.time)} · ${CFG.explorer ? `<a href="${CFG.explorer}/tx/${log.hash}" target="_blank" rel="noopener">${log.hash.slice(0, 10)}… ↗</a>` : `${log.hash.slice(0, 14)}…`}</div>
      </div></li>`).join("")}</ul>`;
    }
    return `<div class="sec"><h2>${t("log.title")}</h2><span class="hint">${t("log.hint")}</span></div><div class="card">${body}</div>`;
  }

  // ---------- Xử lý thao tác ----------
  const actions = {
    connect,
    switch: switchNetwork,
    tab(el) {
      state.tab = el.dataset.tab;
      save("tab", state.tab);
      renderTabs();
      renderView();
      window.scrollTo({ top: 0 });
      if (state.tab === "log") loadLogs();
    },
    async copy(el) {
      try { await navigator.clipboard.writeText(el.dataset.addr); toast("ok", t("copied")); } catch (e) { /* trình duyệt chặn clipboard */ }
    },
    verify: (el) => send("ok.verify", () => state.idc.verify(el.dataset.addr)),
    claim: (el) => send("ok.claim", () => state.asc.claimIncome(el.dataset.id)),
    sale: (el) => send("ok.sale", () => state.asc.setSaleOpen(el.dataset.id, el.dataset.open === "1")),
    withdraw: () => send("ok.withdraw", () => state.asc.withdrawProceeds()),
    demoRole: (el) => DEMO.switchAccount(Number(el.dataset.index)),
    demoReset: () => DEMO.reset(),
  };

  const forms = {
    register(f) {
      const name = f.elements.name.value.trim();
      const idno = f.elements.idno.value.trim();
      const dob = f.elements.dob.value;
      if (!name || !idno || !dob) return toast("err", t("err.form"));
      return send("ok.register", () => state.idc.register(name, f.elements.country.value, docHash(idno, dob)));
    },
    async check(f) {
      const address = f.elements.address.value.trim() || state.account;
      if (!ethers.isAddress(address)) { state.check = { error: true }; return renderView(); }
      const id = await state.idc.getIdentity(address);
      const idno = f.elements.idno.value.trim();
      const dob = f.elements.dob.value;
      const match = idno && dob ? await state.idc.checkDocument(address, docHash(idno, dob)) : null;
      state.check = { address: ethers.getAddress(address), status: Number(id.status), name: id.displayName, match };
      renderView();
    },
    buy(f) {
      const asset = state.data.assets[Number(f.dataset.id)];
      const amount = BigInt(parseInt(f.elements.amount.value, 10) || 0);
      if (amount <= 0n) return toast("err", t("err.form"));
      return send("ok.buy", () => state.asc.buyShares(asset.id, amount, { value: amount * asset.price }));
    },
    transfer(f) {
      const to = f.elements.to.value.trim();
      const amount = BigInt(parseInt(f.elements.amount.value, 10) || 0);
      if (!ethers.isAddress(to) || amount <= 0n) return toast("err", t("err.form"));
      return send("ok.transfer", () => state.asc.transferShares(f.elements.asset.value, to, amount));
    },
    revoke: (f) => send("ok.revoke", () => state.idc.revoke(f.dataset.addr, f.elements.reason.value.trim())),
    create(f) {
      let price;
      try { price = ethers.parseEther(f.elements.price.value); } catch (e) { return toast("err", t("err.form")); }
      const shares = parseInt(f.elements.shares.value, 10) || 0;
      const name = f.elements.name.value.trim();
      if (!name || shares <= 0 || price <= 0n) return toast("err", t("err.form"));
      return send("ok.create", () => state.asc.createAsset(name, f.elements.category.value, f.elements.description.value.trim(), shares, price));
    },
    pay(f) {
      let value;
      try { value = ethers.parseEther(f.elements.amount.value); } catch (e) { return toast("err", t("err.form")); }
      if (value <= 0n) return toast("err", t("err.form"));
      return send("ok.pay", () => state.asc.distributeIncome(f.dataset.id, { value }));
    },
    verifier(f) {
      const address = f.elements.address.value.trim();
      if (!ethers.isAddress(address)) return toast("err", t("check.badaddr"));
      return send("ok.verifier", () => state.idc.setVerifier(address, true));
    },
  };

  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-act]");
    if (!el) return;
    event.preventDefault();
    const handler = actions[el.dataset.act];
    if (handler) handler(el);
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    const handler = forms[form.dataset.form];
    if (!handler) return;
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try { await handler(form); } catch (err) { console.error(err); toast("err", errorMessage(err)); }
    if (button && button.isConnected) button.disabled = false;
  });

  document.addEventListener("input", (event) => {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    if (form.dataset.form === "register") updateHashPreview();
    if (form.dataset.form === "buy") {
      const asset = state.data.assets[Number(form.dataset.id)];
      const amount = BigInt(Math.max(parseInt(form.elements.amount.value, 10) || 0, 0));
      const out = $(`[data-cost="${asset.id}"]`);
      if (out) out.textContent = t("as.cost", { eth: fmtEth(amount * asset.price) });
    }
  });

  $("#langBtn").addEventListener("click", () => {
    state.lang = state.lang === "vi" ? "en" : "vi";
    save("lang", state.lang);
    render();
  });

  $("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    save("theme", next);
    render();
  });

  init();
})();
