/* Giao diện demo: HTML/JS thuần + ethers.js, kết nối MetaMask.
   Cấu trúc: state -> refresh() đọc dữ liệu từ contract -> render() vẽ lại màn hình. */
(function () {
  "use strict";

  const CFG = window.DAPP_CONFIG;
  const ABI = window.DAPP_CONTRACTS;
  const DEMO = window.DEMO_WALLET || null; // khác null = đang ở chế độ demo (blockchain mô phỏng)
  const wallet = DEMO || window.ethereum; // "chiếc ví" mà trang sẽ nói chuyện cùng
  const STATUS = ["none", "pending", "verified", "revoked"];
  const CATEGORIES = { realestate: "🏠", gold: "🪙", art: "🖼️", vehicle: "🚗", other: "📦" };
  const AVATARS = ["🦊", "🐼", "🐯", "🐸", "🐙", "🦉", "🐳", "🦄", "🐝", "🐢", "🦁", "🐧"];
  const COUNTRIES = ["Việt Nam", "Singapore", "Japan", "Korea", "Thailand", "United States", "United Kingdom", "France", "Germany", "Australia"];

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
  const avatar = (addr) => AVATARS[parseInt(addr.slice(2, 8), 16) % AVATARS.length];
  const catKey = (c) => (CATEGORIES[c] ? c : "other");

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
  function addrChip(addr) {
    return `<a href="#" class="mono" data-act="copy" data-addr="${addr}" title="${addr}">${short(addr)}</a>`;
  }
  function txLink(hash) {
    return CFG && CFG.explorer ? `<a href="${CFG.explorer}/tx/${hash}" target="_blank" rel="noopener">${t("tx.view")}</a>` : "";
  }
  function stamp(statusIndex) {
    const s = STATUS[statusIndex] || "none";
    return `<span class="stamp ${s}">${t("status." + s)}</span>`;
  }

  // ---------- Toast ----------
  function toast(kind, html, keep) {
    const el = document.createElement("div");
    const set = (k, h) => { el.className = "toast " + k; el.innerHTML = h; };
    set(kind, html);
    $("#toasts").appendChild(el);
    const api = {
      update(k, h, stay) { set(k, h); if (!stay) setTimeout(() => el.remove(), 6000); },
      remove() { el.remove(); },
    };
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
    const note = toast("pending", DEMO ? `<span class="spin">⏳</span> ${t("tx.mining")}` : t("tx.confirm"), true);
    try {
      const tx = await fn();
      note.update("pending", `<span class="spin">⏳</span> ${t("tx.mining")} ${txLink(tx.hash)}`, true);
      await tx.wait();
      note.update("ok", `${t(okKey)} ${txLink(tx.hash)}`);
      state.logs = null;
      await refresh();
      return true;
    } catch (err) {
      console.error(err);
      note.update("err", "⚠️ " + errorMessage(err));
      return false;
    }
  }

  // ---------- Kết nối ví ----------
  async function init() {
    document.documentElement.lang = state.lang;
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
      toast("err", "⚠️ " + errorMessage(err));
    }
  }

  async function switchNetwork() {
    const chainIdHex = "0x" + CFG.chainId.toString(16);
    try {
      await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
    } catch (err) {
      if (CFG.chainId !== 31337) return toast("err", "⚠️ " + errorMessage(err));
      // Mạng Hardhat local chưa có trong MetaMask -> thêm mới
      try {
        await wallet.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: chainIdHex, chainName: "Hardhat Local", rpcUrls: ["http://127.0.0.1:8545"], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }],
        });
      } catch (err2) { toast("err", "⚠️ " + errorMessage(err2)); }
    }
  }

  // ---------- Đọc dữ liệu từ contract ----------
  async function refresh() {
    const { idc, asc, account } = state;
    const [owner, amVerifier, users, rawAssets, proceeds, balance] = await Promise.all([
      idc.owner(), idc.isVerifier(account), idc.getUsers(), asc.getAssets(), asc.saleProceeds(), state.provider.getBalance(account),
    ]);

    const identities = await Promise.all(users.map((u) => idc.getIdentity(u)));
    const people = {};
    const list = users.map((addr, i) => {
      const id = identities[i];
      const person = {
        address: addr, displayName: id.displayName, country: id.country, docHash: id.docHash, status: Number(id.status),
        registeredAt: id.registeredAt, updatedAt: id.updatedAt, verifiedBy: id.verifiedBy, note: id.note,
      };
      people[addr.toLowerCase()] = person;
      return person;
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
      owner, isOwner: same(owner, account), isVerifier: amVerifier, users: list, people, assets, proceeds, balance,
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
    $("#tagline").textContent = t("tagline");
    $("#langBtn").textContent = t("lang.switch");
    $("#docsLink").textContent = t("docs");
    renderWallet();
    renderBanner();
    renderTabs();
    renderView();
    $("#footer").innerHTML = CFG
      ? t("footer", { net: esc(CFG.networkName), id: `<span class="mono">${CFG.identity.address}</span>`, as: `<span class="mono">${CFG.asset.address}</span>` })
      : "";
  }

  function renderWallet() {
    const box = $("#walletBox");
    if (!state.account) {
      box.innerHTML = DEMO || state.problem === "nomm" || state.problem === "setup" ? "" : `<button class="btn" data-act="connect">${t("connect")}</button>`;
      return;
    }
    const d = state.data;
    const role = d ? (d.isOwner ? "admin" : d.isVerifier ? "verifier" : "user") : null;
    box.innerHTML = `<div class="wallet-chip">
      <span class="dot"></span><span>${avatar(state.account)}</span>${addrChip(state.account)}
      ${d ? `<span class="muted">${fmtEth(d.balance)}</span>` : ""}
      ${role ? `<span class="role-tag ${role === "user" ? "user" : ""}">${t("role." + role)}</span>` : ""}
    </div>`;
  }

  function renderBanner() {
    let html = "";
    if (state.problem === "wrongnet") {
      html = `<div class="banner"><span>⚠️ ${t("net.wrong", { name: esc(CFG.networkName) })}</span>
        <button class="btn small" data-act="switch">${t("net.switch", { name: esc(CFG.networkName) })}</button></div>`;
    } else if (state.problem === "nocode") {
      html = `<div class="banner"><span>⚠️ ${t("net.nocode")}</span></div>`;
    }
    if (DEMO) {
      const roles = DEMO.roles.map((role, i) => `<button class="btn small ${i === DEMO.selected ? "" : "ghost"}" data-act="demoRole" data-index="${i}" title="${DEMO.addresses[i]}">${t("demo.role." + role)}</button>`).join("");
      html = `<div class="banner demo"><div><b>🎭 ${t("demo.title")}</b> <span class="hint">${t("demo.hint")}</span>
          <div class="row mt-s"><span>${t("demo.playAs")}</span>${roles}</div></div>
        <div class="row"><button class="btn small ghost" data-act="demoReset">↺ ${t("demo.reset")}</button>
          ${window.DAPP_HAS_REAL ? `<a class="btn small ghost" href="?wallet">🦊 ${t("demo.useWallet")}</a>` : ""}</div></div>` + html;
    }
    $("#banner").innerHTML = html;
  }

  function renderTabs() {
    const nav = $("#tabs");
    if (!state.data) { nav.innerHTML = ""; return; }
    const pending = state.data.users.filter((u) => u.status === 1).length;
    const tabs = ["home", "identity", "assets"].concat(canAdmin() ? ["admin"] : [], ["log"]);
    nav.innerHTML = tabs.map((id) => `<button class="tab ${state.tab === id ? "active" : ""}" data-act="tab" data-tab="${id}">
      ${t("tab." + id)}${id === "admin" && state.data.isVerifier && pending ? `<span class="count">${pending}</span>` : ""}</button>`).join("");
  }

  function renderView() {
    const view = $("#view");
    if (state.problem === "setup") { view.innerHTML = notice("🧰", t("setup.title"), t("setup.body")); return; }
    if (state.problem === "nomm") {
      view.innerHTML = notice("🦊", t("nomm.title"), t("nomm.body"),
        `<div class="row center-row"><a class="btn big" href="https://metamask.io/download/" target="_blank" rel="noopener">${t("nomm.btn")}</a>
          <a class="btn big ghost" href="?demo">🎭 ${t("demo.try")}</a></div>`);
      return;
    }
    if (!state.data) {
      view.innerHTML = DEMO ? notice(`<span class="spin">⏳</span>`, t("demo.loading"), t("demo.loadingHint")) : viewWelcome();
      return;
    }
    const views = { home: viewHome, identity: viewIdentity, assets: viewAssets, admin: viewAdmin, log: viewLog };
    view.innerHTML = (views[state.tab] || viewHome)();
    updateHashPreview();
  }

  function notice(icon, title, body, extra) {
    return `<div class="card hero tape"><div style="font-size:3.4rem">${icon}</div><h2>${title}</h2><p>${body}</p>${extra || ""}</div>`;
  }

  const DOODLE = `<svg class="doodle" viewBox="0 0 220 120" aria-hidden="true" fill="none" stroke="#2b2a28" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <rect x="8" y="42" width="52" height="40" rx="7" fill="#a5d8ff"/><rect x="84" y="40" width="52" height="42" rx="7" fill="#ffe066"/><rect x="160" y="43" width="52" height="40" rx="7" fill="#b2f2bb"/>
    <path d="M60 62 C68 54 76 70 84 61 M136 61 C144 53 152 70 160 62"/>
    <path d="M22 58 h24 M22 68 h16 M98 57 h24 M98 67 h14 M174 59 h24 M174 69 h16" stroke-width="2.5"/>
    <path d="M100 22 l8 8 l16 -18" stroke="#2b8a3e" stroke-width="4"/><path d="M20 100 q90 16 180 0" stroke-dasharray="5 7" stroke-width="2"/></svg>`;

  function explainCards() {
    return `<div class="grid three">
      <div class="card tint-blue"><div class="explain"><span class="big-icon">🪪</span><div><h3>${t("explain.id.t")}</h3><p>${t("explain.id.d")}</p></div></div></div>
      <div class="card alt tint-yellow"><div class="explain"><span class="big-icon">🧩</span><div><h3>${t("explain.asset.t")}</h3><p>${t("explain.asset.d")}</p></div></div></div>
      <div class="card tint-green"><div class="explain"><span class="big-icon">🔗</span><div><h3>${t("explain.link.t")}</h3><p>${t("explain.link.d")}</p></div></div></div>
    </div>`;
  }

  function viewWelcome() {
    return `<div class="card hero tape">${DOODLE}<h2>${t("hero.title")}</h2><p>${t("hero.body")}</p>
      <div class="row center-row"><button class="btn big" data-act="connect">${t("connect")}</button>
        <a class="btn big ghost" href="?demo">🎭 ${t("demo.try")}</a></div><p class="hint">${t("hero.note")}</p></div>${explainCards()}`;
  }

  // ----- Tổng quan -----
  function viewHome() {
    const d = state.data;
    const st = d.me.status;
    const ownsShares = d.assets.some((a) => a.mine > 0n);
    const done = [true, st === 1 || st === 2, st === 2, ownsShares];
    const current = done.indexOf(false);
    const icons = ["🦊", "📝", "✅", "🏠"];
    const steps = [1, 2, 3, 4].map((n, i) => {
      let stateText = done[i] ? t("step.done") : t("step.todo");
      let cta = "";
      if (i === 2 && st === 1) stateText = t("step.wait");
      if (i === current && i === 1) cta = `<button class="btn small" data-act="tab" data-tab="identity">${t("step2.go")}</button>`;
      if (i === current && i === 3) cta = `<button class="btn small" data-act="tab" data-tab="assets">${t("step4.go")}</button>`;
      return `<div class="step ${done[i] ? "done" : i === current ? "current" : ""}"><span class="num">${n}</span>
        <div class="icon">${icons[i]}</div><h3>${t("step" + n + ".t")}</h3><p class="hint">${t("step" + n + ".d")}</p>
        <p class="state">${stateText}</p>${cta}</div>`;
    }).join("");

    const pending = d.users.filter((u) => u.status === 1).length;
    const stats = [
      ["🪪", d.users.length, t("stat.users")],
      ["✅", d.users.filter((u) => u.status === 2).length, t("stat.verified")],
      ["🏠", d.assets.length, t("stat.assets")],
      ["⏳", pending, t("stat.pending")],
    ].map(([icon, value, label]) => `<div class="step"><div class="icon">${icon}</div><h2>${value}</h2><p class="hint">${label}</p></div>`).join("");

    const hello = t("home.hello", { name: d.me.displayName ? esc(d.me.displayName) : short(state.account) });
    return `<div class="card tape tint-yellow"><h2>${hello}</h2>
        ${d.isOwner ? `<p>${t("home.helloAdmin")}</p>` : ""}
        ${d.isVerifier && pending ? `<p class="row"><span>⏳ ${t("stat.pending")}: <b>${pending}</b></span><button class="btn small green" data-act="tab" data-tab="admin">${t("home.pendingCta")}</button></p>` : ""}
      </div>
      <div class="section-title"><h2>${t("home.journey")}</h2></div>
      <div class="steps">${steps}</div>
      <div class="section-title"><h2>${t("home.stats")}</h2></div>
      <div class="steps">${stats}</div>
      <div class="section-title"><h2>${t("home.learn")}</h2></div>${explainCards()}`;
  }

  // ----- Danh tính -----
  function idCard(p) {
    return `<div class="idcard">
      <div class="id-head"><span>${t("id.cardTitle")}</span><span>⛓ ${t("id.cardChain")}</span></div>
      <div class="id-body"><div class="avatar">${avatar(p.address)}</div><div>
        <div class="name">${esc(p.displayName)}</div>
        <dl><dt>${t("id.wallet")}</dt><dd>${addrChip(p.address)}</dd>
          <dt>${t("id.country")}</dt><dd>${esc(p.country)}</dd>
          <dt>${t("id.since")}</dt><dd>${fmtDate(p.registeredAt)}</dd>
          ${p.status === 2 ? `<dt>${t("id.by")}</dt><dd>${nameOf(p.verifiedBy)}</dd>` : ""}
          <dt>${t("id.doc")}</dt><dd class="mono" title="${p.docHash}">${p.docHash.slice(0, 18)}…</dd></dl>
      </div></div>${stamp(p.status)}</div>`;
  }

  function registerForm() {
    return `<form class="form mt" data-form="register">
      <label class="field">${t("f.name")}<input name="name" maxlength="64" required autocomplete="off"><small>${t("f.name.h")}</small></label>
      <label class="field">${t("f.country")}<select name="country">${COUNTRIES.map((c) => `<option>${c}</option>`).join("")}</select></label>
      <div class="form-grid">
        <label class="field">${t("f.idno")}<input name="idno" required autocomplete="off" placeholder="001200012345"></label>
        <label class="field">${t("f.dob")}<input name="dob" type="date" required></label>
      </div>
      <small class="hint">🔒 ${t("f.idno.h")}</small>
      <div class="hint" id="hashPreview"></div>
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
        : `<div class="result mt ${c.status === 2 ? "ok" : ""}">
            <p>${t("check.status", { addr: addrChip(c.address) })} ${stamp(c.status)}${c.name ? ` — <b>${esc(c.name)}</b>` : ""}</p>
            ${c.match === null ? "" : `<p>${t(c.match ? "check.match" : "check.nomatch")}</p>`}</div>`;
    }

    return `<div class="grid two">
      <div class="card tape">${mine}</div>
      <div>
        <div class="card alt tint-blue"><h3>${t("id.privacy.t")}</h3><p>${t("id.privacy.d")}</p></div>
        <div class="card"><h3>${t("check.t")}</h3><p class="hint">${t("check.d")}</p>
          <form class="form mt" data-form="check">
            <label class="field">${t("check.addr")}<input name="address" placeholder="0x…" autocomplete="off"><small>${t("check.addr.h")}</small></label>
            <div class="form-grid">
              <label class="field">${t("check.idno")}<input name="idno" autocomplete="off"></label>
              <label class="field">${t("check.dob")}<input name="dob" type="date"></label>
            </div>
            <div><button class="btn blue" type="submit">${t("check.btn")}</button></div>
          </form>${result}</div>
      </div></div>`;
  }

  function updateHashPreview() {
    const form = $('form[data-form="register"]');
    const out = $("#hashPreview");
    if (!form || !out) return;
    const idno = form.idno.value.trim();
    const dob = form.dob.value;
    out.innerHTML = idno && dob ? `${t("id.hashPreview")} <span class="mono">${docHash(idno, dob).slice(0, 34)}…</span>` : "";
  }

  // ----- Tài sản -----
  function assetCard(a, canBuy) {
    const left = a.totalShares - a.sharesSold;
    const soldPct = pct(a.sharesSold, a.totalShares);
    const status = left === 0n ? ["closed", "as.soldout"] : a.saleOpen ? ["", "as.open"] : ["closed", "as.closed"];
    const holders = a.holders.length
      ? `<table>${a.holders.map((h) => `<tr><td>${avatar(h.address)} ${nameOf(h.address)}</td><td class="num">${h.shares}</td><td class="num">${pct(h.shares, a.totalShares)}%</td></tr>`).join("")}</table>`
      : `<p class="hint">${t("as.noHolders")}</p>`;
    const buy = left > 0n && a.saleOpen
      ? `<form class="inline-form" data-form="buy" data-id="${a.id}">
          <input name="amount" type="number" min="1" max="${left}" value="1" required aria-label="${t("f.amount")}" ${canBuy ? "" : "disabled"}>
          <button class="btn green" type="submit" ${canBuy ? "" : "disabled"}>${t("as.buy")}</button></form>
          <div class="cost" data-cost="${a.id}">${t("as.cost", { eth: fmtEth(a.price) })}</div>`
      : "";
    return `<div class="card asset">
      <div class="asset-pic cat-${a.category}">${CATEGORIES[a.category]}</div>
      <div class="row"><span class="pill ${status[0]}">${t(status[1])}</span><span class="hint">${t("cat." + a.category)}</span></div>
      <h3>${esc(a.name)}</h3><p class="desc">${esc(a.description)}</p>
      <div class="facts">
        <div><b>${fmtEth(a.price)}</b><span>${t("as.price")}</span></div>
        <div><b>${fmtEth(a.price * a.totalShares)}</b><span>${t("as.total")}</span></div>
        <div><b>${left}</b><span>${t("as.left")}</span></div>
        <div><b>${fmtEth(a.totalIncome)}</b><span>${t("as.income")}</span></div>
      </div>
      <div><div class="bar"><i class="${a.sharesSold === 0n ? "zero" : ""}" style="width:${Number(a.sharesSold * 100n / a.totalShares)}%"></i></div>
        <span class="hint">${t("as.sold", { sold: a.sharesSold, total: a.totalShares, pct: soldPct })}</span></div>
      ${a.mine > 0n ? `<div><span class="pill mine">⭐ ${t("as.youOwn", { n: a.mine, pct: pct(a.mine, a.totalShares) })}</span></div>` : ""}
      ${buy}
      <details class="holders"><summary>${t("as.holders", { n: a.holders.length })}</summary>${holders}</details>
    </div>`;
  }

  function viewAssets() {
    const d = state.data;
    const verified = d.me.status === 2;
    const mine = d.assets.filter((a) => a.mine > 0n || a.claimable > 0n);

    const needId = verified ? "" : `<div class="card tint-pink"><div class="explain"><span class="big-icon">🪪</span><div>
      <h3>${t("as.needId.t")}</h3><p>${t("as.needId.d")}</p>
      <button class="btn small" data-act="tab" data-tab="identity">${t("as.needId.btn")}</button></div></div></div>`;

    let portfolio;
    if (!mine.length) {
      portfolio = `<div class="empty"><span class="icon">🧺</span>${t("as.noHoldings")}</div>`;
    } else {
      const rows = mine.map((a) => `<tr>
        <td>${CATEGORIES[a.category]} <b>${esc(a.name)}</b></td>
        <td class="num">${a.mine}</td><td class="num">${pct(a.mine, a.totalShares)}%</td><td class="num">${fmtEth(a.mine * a.price)}</td>
        <td class="num"><b>${fmtEth(a.claimable)}</b></td>
        <td><button class="btn small green" data-act="claim" data-id="${a.id}" ${a.claimable > 0n ? "" : "disabled"}>${t("as.claim")}</button></td></tr>`).join("");
      const holdings = mine.filter((a) => a.mine > 0n);
      const peers = d.users.filter((u) => u.status === 2 && !same(u.address, state.account));
      const transfer = holdings.length ? `<h3 class="mt">${t("as.transfer")}</h3><p class="hint">${t("as.transfer.hint")}</p>
        <form class="form mt" data-form="transfer"><div class="form-grid">
          <label class="field">${t("f.asset")}<select name="asset">${holdings.map((a) => `<option value="${a.id}">${esc(a.name)} (${a.mine})</option>`).join("")}</select></label>
          <label class="field">${t("f.to")}<input name="to" list="peers" placeholder="0x…" required autocomplete="off"></label>
          <label class="field">${t("f.amount")}<input name="amount" type="number" min="1" value="1" required></label>
        </div><small class="hint">${t("f.to.h")}</small>
        <datalist id="peers">${peers.map((u) => `<option value="${u.address}">${esc(u.displayName)}</option>`).join("")}</datalist>
        <div><button class="btn blue" type="submit">${t("as.transfer.btn")}</button></div></form>` : "";
      portfolio = `<div class="table-wrap"><table><thead><tr><th>${t("as.col.asset")}</th><th class="num">${t("as.col.shares")}</th><th class="num">${t("as.col.own")}</th>
        <th class="num">${t("as.col.value")}</th><th class="num">${t("as.col.income")}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${transfer}`;
    }

    const market = d.assets.length
      ? `<div class="grid three">${d.assets.map((a) => assetCard(a, verified)).join("")}</div>`
      : `<div class="card empty"><span class="icon">📭</span>${t("as.none")}</div>`;

    return `${needId}
      <div class="section-title"><h2>${t("as.portfolio")}</h2><span class="hint">${t("as.portfolio.hint")}</span></div>
      <div class="card tape">${portfolio}</div>
      <div class="section-title"><h2>${t("as.market")}</h2><span class="hint">${t("as.market.hint")}</span></div>${market}`;
  }

  // ----- Quản trị -----
  function viewAdmin() {
    const d = state.data;
    let html = "";

    if (d.isVerifier) {
      const order = { 1: 0, 2: 1, 3: 2 };
      const rows = d.users.slice().sort((a, b) => order[a.status] - order[b.status]).map((u) => {
        let actions = "";
        if (u.status === 1) actions += `<button class="btn small green" data-act="verify" data-addr="${u.address}">${t("ad.verify")}</button>`;
        if (u.status === 1 || u.status === 2) {
          actions += `<form class="inline-form" data-form="revoke" data-addr="${u.address}"><input name="reason" placeholder="${t("ad.reason")}" maxlength="80">
            <button class="btn small pink" type="submit">${t(u.status === 1 ? "ad.reject" : "ad.revoke")}</button></form>`;
        }
        if (u.status === 3) actions = `<span class="hint">${esc(u.note || "")}</span>`;
        return `<tr><td>${avatar(u.address)} <b>${esc(u.displayName)}</b><br><span class="hint">${esc(u.country)}</span></td>
          <td>${addrChip(u.address)}</td><td>${fmtDate(u.updatedAt)}</td><td>${stamp(u.status)}</td><td><div class="row">${actions}</div></td></tr>`;
      }).join("");
      html += `<div class="section-title"><h2>${t("ad.requests")}</h2><span class="hint">${t("ad.requests.hint")}</span></div>
        <div class="card tape">${d.users.length ? `<div class="table-wrap"><table><thead><tr><th>${t("ad.col.person")}</th><th>${t("ad.col.wallet")}</th>
          <th>${t("ad.col.date")}</th><th>${t("ad.col.status")}</th><th>${t("ad.col.action")}</th></tr></thead><tbody>${rows}</tbody></table></div>`
          : `<div class="empty"><span class="icon">📭</span>${t("ad.noUsers")}</div>`}</div>`;
    }

    if (d.isOwner) {
      const manageRows = d.assets.map((a) => `<tr><td>${CATEGORIES[a.category]} <b>${esc(a.name)}</b></td>
        <td class="num">${a.sharesSold}/${a.totalShares}</td><td class="num">${fmtEth(a.totalIncome)}</td>
        <td><form class="inline-form" data-form="pay" data-id="${a.id}"><input name="amount" type="number" step="any" min="0" placeholder="0.01" required ${a.sharesSold > 0n ? "" : "disabled"}>
          <button class="btn small green" type="submit" ${a.sharesSold > 0n ? "" : "disabled"}>${t("ad.pay")}</button></form></td>
        <td><button class="btn small ghost" data-act="sale" data-id="${a.id}" data-open="${a.saleOpen ? "0" : "1"}">${t(a.saleOpen ? "ad.close" : "ad.reopen")}</button></td></tr>`).join("");

      html += `<div class="section-title"><h2>${t("ad.create")}</h2><span class="hint">${t("ad.create.hint")}</span></div>
        <div class="card alt"><form class="form" data-form="create">
          <div class="form-grid">
            <label class="field">${t("f.aname")}<input name="name" maxlength="64" required autocomplete="off"></label>
            <label class="field">${t("f.cat")}<select name="category">${Object.keys(CATEGORIES).map((c) => `<option value="${c}">${CATEGORIES[c]} ${t("cat." + c)}</option>`).join("")}</select></label>
          </div>
          <label class="field">${t("f.desc")}<input name="description" maxlength="200" autocomplete="off"></label>
          <div class="form-grid">
            <label class="field">${t("f.shares")}<input name="shares" type="number" min="1" max="1000000" value="100" required></label>
            <label class="field">${t("f.price")}<input name="price" type="number" step="any" min="0" value="0.001" required></label>
          </div>
          <div><button class="btn" type="submit">${t("ad.create.btn")}</button></div></form></div>

        <div class="section-title"><h2>${t("ad.manage")}</h2><span class="hint">${t("ad.manage.hint")}</span></div>
        <div class="card">${d.assets.length ? `<div class="table-wrap"><table><thead><tr><th>${t("as.col.asset")}</th><th class="num">${t("ad.col.sold")}</th>
          <th class="num">${t("ad.col.dist")}</th><th>${t("ad.col.pay")}</th><th></th></tr></thead><tbody>${manageRows}</tbody></table></div>`
          : `<div class="empty"><span class="icon">📭</span>${t("as.none")}</div>`}</div>

        <div class="grid two mt">
          <div class="card tint-green"><h3>💵 ${t("ad.proceeds")}</h3><p class="hint">${t("ad.proceeds.d")}</p>
            <div class="row mt"><h2>${fmtEth(d.proceeds)}</h2><span class="spacer"></span>
            <button class="btn green" data-act="withdraw" ${d.proceeds > 0n ? "" : "disabled"}>${t("ad.withdraw")}</button></div></div>
          <div class="card alt tint-blue"><h3>🧑‍⚖️ ${t("ad.verifiers")}</h3><p class="hint">${t("ad.verifiers.d")}</p>
            <form class="inline-form mt" data-form="verifier"><input name="address" placeholder="0x…" required autocomplete="off">
            <button class="btn small blue" type="submit">${t("ad.addVerifier")}</button></form></div>
        </div>`;
    }
    return html;
  }

  // ----- Nhật ký -----
  const LOG_ICONS = {
    IdentityRegistered: "📝", IdentityVerified: "✅", IdentityRevoked: "🚫", VerifierChanged: "🧑‍⚖️", AssetCreated: "🧩", SharesPurchased: "🛒",
    SharesTransferred: "🔁", IncomeDistributed: "💸", IncomeClaimed: "💰", SaleStatusChanged: "🚦", ProceedsWithdrawn: "🏦",
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
    if (state.logs === null) body = `<div class="empty"><span class="icon spin">⏳</span>${t("log.loading")}</div>`;
    else if (state.logs === "error") body = `<div class="empty"><span class="icon">🌧️</span>${t("log.error")}</div>`;
    else if (!state.logs.length) body = `<div class="empty"><span class="icon">📭</span>${t("log.empty")}</div>`;
    else {
      body = `<ul class="log">${state.logs.map((log) => `<li><span class="ico">${LOG_ICONS[log.name] || "•"}</span><div>
        <div>${describe(log)}</div>
        <div class="meta">${fmtDate(log.time)} · ${t("log.block", { n: log.block })}${CFG.explorer ? ` · <a href="${CFG.explorer}/tx/${log.hash}" target="_blank" rel="noopener">${t("log.viewTx")}</a>` : ` · <span class="mono">${log.hash.slice(0, 14)}…</span>`}</div>
      </div></li>`).join("")}</ul>`;
    }
    return `<div class="section-title"><h2>${t("log.title")}</h2><span class="hint">${t("log.hint")}</span></div><div class="card tape">${body}</div>`;
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
      try { await navigator.clipboard.writeText(el.dataset.addr); toast("ok", "📋 " + t("copied")); } catch (e) { /* trình duyệt chặn clipboard */ }
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
      const name = f.name.value.trim();
      const idno = f.idno.value.trim();
      if (!name || !idno || !f.dob.value) return toast("err", t("err.form"));
      return send("ok.register", () => state.idc.register(name, f.country.value, docHash(idno, f.dob.value)));
    },
    async check(f) {
      const address = f.address.value.trim() || state.account;
      if (!ethers.isAddress(address)) { state.check = { error: true }; return renderView(); }
      const id = await state.idc.getIdentity(address);
      const idno = f.idno.value.trim();
      const match = idno && f.dob.value ? await state.idc.checkDocument(address, docHash(idno, f.dob.value)) : null;
      state.check = { address: ethers.getAddress(address), status: Number(id.status), name: id.displayName, match };
      renderView();
    },
    buy(f) {
      const asset = state.data.assets[Number(f.dataset.id)];
      const amount = BigInt(parseInt(f.amount.value, 10) || 0);
      if (amount <= 0n) return toast("err", t("err.form"));
      return send("ok.buy", () => state.asc.buyShares(asset.id, amount, { value: amount * asset.price }));
    },
    transfer(f) {
      const to = f.to.value.trim();
      const amount = BigInt(parseInt(f.amount.value, 10) || 0);
      if (!ethers.isAddress(to) || amount <= 0n) return toast("err", t("err.form"));
      return send("ok.transfer", () => state.asc.transferShares(f.asset.value, to, amount));
    },
    revoke: (f) => send("ok.revoke", () => state.idc.revoke(f.dataset.addr, f.reason.value.trim())),
    create(f) {
      let price;
      try { price = ethers.parseEther(f.price.value); } catch (e) { return toast("err", t("err.form")); }
      const shares = parseInt(f.shares.value, 10) || 0;
      if (!f.name.value.trim() || shares <= 0 || price <= 0n) return toast("err", t("err.form"));
      return send("ok.create", () => state.asc.createAsset(f.name.value.trim(), f.category.value, f.description.value.trim(), shares, price));
    },
    pay(f) {
      let value;
      try { value = ethers.parseEther(f.amount.value); } catch (e) { return toast("err", t("err.form")); }
      if (value <= 0n) return toast("err", t("err.form"));
      return send("ok.pay", () => state.asc.distributeIncome(f.dataset.id, { value }));
    },
    verifier(f) {
      const address = f.address.value.trim();
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
    try { await handler(form); } catch (err) { console.error(err); toast("err", "⚠️ " + errorMessage(err)); }
    if (button && button.isConnected) button.disabled = false;
  });

  document.addEventListener("input", (event) => {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    if (form.dataset.form === "register") updateHashPreview();
    if (form.dataset.form === "buy") {
      const asset = state.data.assets[Number(form.dataset.id)];
      const amount = BigInt(Math.max(parseInt(form.amount.value, 10) || 0, 0));
      const out = $(`[data-cost="${asset.id}"]`);
      if (out) out.textContent = t("as.cost", { eth: fmtEth(amount * asset.price) });
    }
  });

  $("#langBtn").addEventListener("click", () => {
    state.lang = state.lang === "vi" ? "en" : "vi";
    save("lang", state.lang);
    render();
  });

  init();
})();
