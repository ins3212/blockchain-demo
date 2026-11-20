// Blockchain mô phỏng chạy ngay trong trình duyệt (dùng cho "chế độ demo").
// - Dùng máy ảo Ethereum thật (@ethereumjs/vm) nên smart contract chạy y như trên mạng thật.
// - Đóng vai một chiếc ví chuẩn EIP-1193 (giống window.ethereum của MetaMask) để ethers.js gọi vào.
// - Mỗi giao dịch = 1 khối. Lịch sử giao dịch được trả ra qua onTransaction để lưu lại và phát lại
//   khi tải lại trang (tham số history).
// File này được đóng gói thành frontend/vendor/sim-chain.js bằng `npm run build:web`.
import { createVM, runTx } from "@ethereumjs/vm";
import { createLegacyTx } from "@ethereumjs/tx";
import { createCustomCommon, Mainnet, Hardfork } from "@ethereumjs/common";
import { createBlock } from "@ethereumjs/block";
import { createAccount, createAddressFromString, createAddressFromPrivateKey, hexToBytes, bytesToHex } from "@ethereumjs/util";

const GAS_PRICE = 8n; // phí gas tượng trưng để số dư không bị lẻ khó nhìn
const BASE_FEE = 7n;
const TX_GAS_LIMIT = 12_000_000n;
const BLOCK_GAS_LIMIT = 30_000_000n;
const ZERO_HASH = "0x" + "0".repeat(64);
const EMPTY_BLOOM = "0x" + "0".repeat(512);

const hex = (n) => "0x" + BigInt(n).toString(16);

function rpcError(code, message, data) {
  const err = new Error(message);
  err.code = code;
  if (data !== undefined) err.data = data;
  return err;
}

export async function createSimChain(options) {
  const { chainId = 31337, privateKeys, balance = 10000n * 10n ** 18n, history = [], onTransaction } = options;
  const common = createCustomCommon({ chainId, name: "demo" }, Mainnet, { hardfork: Hardfork.London });
  const vm = await createVM({ common });

  const keys = {}; // địa chỉ (chữ thường) -> khoá bí mật
  const accounts = [];
  for (const pk of privateKeys) {
    const key = hexToBytes(pk);
    const address = createAddressFromPrivateKey(key);
    keys[address.toString().toLowerCase()] = key;
    accounts.push(address.toString());
    await vm.stateManager.putAccount(address, createAccount({ nonce: 0n, balance }));
  }
  let selected = 0;

  const blocks = [{ number: 0, hash: "0x" + "11".repeat(32), parentHash: ZERO_HASH, timestamp: Math.floor(Date.now() / 1000) - 86400, gasUsed: 0n, transactions: [] }];
  const txs = {}; // hash -> { tx, receipt }
  const logs = [];

  function makeBlock(number, timestamp) {
    return createBlock(
      { header: { number: BigInt(number), timestamp: BigInt(timestamp), gasLimit: BLOCK_GAS_LIMIT, baseFeePerGas: BASE_FEE, parentHash: hexToBytes(blocks[number - 1].hash) } },
      { common, skipConsensusFormatValidation: true }
    );
  }

  /** Thực thi một giao dịch và đóng thành một khối mới. */
  async function mine(req, timestamp) {
    const from = String(req.from || "").toLowerCase();
    const key = keys[from];
    if (!key) throw rpcError(4100, "Unknown account " + req.from);
    const sender = createAddressFromString(from);
    const account = await vm.stateManager.getAccount(sender);
    const number = blocks.length;
    const block = makeBlock(number, timestamp);

    const tx = createLegacyTx(
      {
        nonce: account ? account.nonce : 0n,
        gasPrice: GAS_PRICE,
        gasLimit: TX_GAS_LIMIT,
        to: req.to ? createAddressFromString(req.to) : undefined,
        value: BigInt(req.value || 0),
        data: hexToBytes(req.data || req.input || "0x"),
      },
      { common }
    ).sign(key);

    let result;
    try {
      result = await runTx(vm, { tx, block, skipBlockGasLimitValidation: true });
    } catch (err) {
      throw rpcError(-32000, /balance|funds/i.test(err.message) ? "insufficient funds for gas * price + value" : err.message);
    }

    const hash = bytesToHex(tx.hash());
    const blockHash = bytesToHex(block.hash());
    const txLogs = (result.receipt.logs || []).map((log, i) => ({
      address: bytesToHex(log[0]),
      topics: log[1].map((t) => bytesToHex(t)),
      data: bytesToHex(log[2]),
      blockNumber: hex(number),
      blockHash,
      transactionHash: hash,
      transactionIndex: "0x0",
      logIndex: hex(i),
      removed: false,
    }));
    logs.push(...txLogs);

    const common_ = { blockHash, blockNumber: hex(number), transactionIndex: "0x0", from, to: req.to ? req.to.toLowerCase() : null };
    txs[hash] = {
      tx: {
        ...common_, hash, nonce: hex(tx.nonce), gas: hex(tx.gasLimit), gasPrice: hex(GAS_PRICE), value: hex(tx.value), input: bytesToHex(tx.data),
        type: "0x0", chainId: hex(chainId), v: hex(tx.v), r: hex(tx.r), s: hex(tx.s),
      },
      receipt: {
        ...common_, transactionHash: hash, type: "0x0", status: result.execResult.exceptionError ? "0x0" : "0x1",
        gasUsed: hex(result.totalGasSpent), cumulativeGasUsed: hex(result.totalGasSpent), effectiveGasPrice: hex(GAS_PRICE),
        contractAddress: result.createdAddress ? result.createdAddress.toString() : null, logs: txLogs, logsBloom: EMPTY_BLOOM,
      },
    };
    blocks.push({ number, hash: blockHash, parentHash: blocks[number - 1].hash, timestamp, gasUsed: result.totalGasSpent, transactions: [hash] });
    return hash;
  }

  /** Chạy thử (không ghi) - dùng cho eth_call và eth_estimateGas. */
  async function simulate(req) {
    const caller = createAddressFromString(req.from || accounts[selected]);
    // Chạy trên trạng thái thật rồi hoàn tác toàn bộ thay đổi
    await vm.evm.journal.checkpoint();
    let result;
    try {
      result = await vm.evm.runCall({
        caller,
        origin: caller,
        to: req.to ? createAddressFromString(req.to) : undefined,
        data: hexToBytes(req.data || req.input || "0x"),
        value: BigInt(req.value || 0),
        gasLimit: TX_GAS_LIMIT,
        block: makeBlock(blocks.length, Math.floor(Date.now() / 1000)),
      });
    } finally {
      await vm.evm.journal.revert();
    }
    if (result.execResult.exceptionError) {
      throw rpcError(3, "execution reverted", bytesToHex(result.execResult.returnValue));
    }
    return result;
  }

  function blockByTag(tag) {
    if (tag === undefined || tag === "latest" || tag === "pending" || tag === "safe" || tag === "finalized") return blocks[blocks.length - 1];
    if (tag === "earliest") return blocks[0];
    return blocks[Number(BigInt(tag))];
  }

  function formatBlock(b) {
    if (!b) return null;
    return {
      number: hex(b.number), hash: b.hash, parentHash: b.parentHash, timestamp: hex(b.timestamp), nonce: "0x0000000000000000", difficulty: "0x0",
      gasLimit: hex(BLOCK_GAS_LIMIT), gasUsed: hex(b.gasUsed), miner: "0x" + "0".repeat(40), extraData: "0x", baseFeePerGas: hex(BASE_FEE),
      stateRoot: ZERO_HASH, receiptsRoot: ZERO_HASH, transactionsRoot: ZERO_HASH, logsBloom: EMPTY_BLOOM, sha3Uncles: ZERO_HASH, mixHash: ZERO_HASH,
      size: "0x0", totalDifficulty: "0x0", uncles: [], transactions: b.transactions,
    };
  }

  function matchLog(log, filter, from, to) {
    const n = Number(BigInt(log.blockNumber));
    if (n < from || n > to) return false;
    if (filter.address) {
      const list = (Array.isArray(filter.address) ? filter.address : [filter.address]).map((a) => a.toLowerCase());
      if (!list.includes(log.address.toLowerCase())) return false;
    }
    const topics = filter.topics || [];
    for (let i = 0; i < topics.length; i++) {
      if (topics[i] == null) continue;
      const wanted = (Array.isArray(topics[i]) ? topics[i] : [topics[i]]).map((x) => x.toLowerCase());
      if (!log.topics[i] || !wanted.includes(log.topics[i].toLowerCase())) return false;
    }
    return true;
  }

  // Phát lại lịch sử đã lưu để khôi phục trạng thái sau khi tải lại trang
  for (const item of history) await mine(item, item.timestamp);

  // Máy ảo chỉ xử lý được một việc tại một thời điểm -> xếp hàng mọi yêu cầu
  let queue = Promise.resolve();
  function request(args) {
    const run = queue.then(() => handle(args));
    queue = run.catch(() => {});
    return run;
  }

  async function handle({ method, params = [] }) {
    switch (method) {
      case "eth_chainId": return hex(chainId);
      case "net_version": return String(chainId);
      case "eth_accounts":
      case "eth_requestAccounts": return [accounts[selected].toLowerCase()];
      case "eth_blockNumber": return hex(blocks.length - 1);
      case "eth_gasPrice": return hex(GAS_PRICE);
      case "eth_maxPriorityFeePerGas": return hex(1n);
      case "eth_getBalance": {
        const account = await vm.stateManager.getAccount(createAddressFromString(params[0]));
        return hex(account ? account.balance : 0n);
      }
      case "eth_getTransactionCount": {
        const account = await vm.stateManager.getAccount(createAddressFromString(params[0]));
        return hex(account ? account.nonce : 0n);
      }
      case "eth_getCode": return bytesToHex(await vm.stateManager.getCode(createAddressFromString(params[0])));
      case "eth_call": return bytesToHex((await simulate(params[0])).execResult.returnValue);
      case "eth_estimateGas": await simulate(params[0]); return hex(TX_GAS_LIMIT);
      case "eth_sendTransaction": {
        const req = params[0];
        const timestamp = Math.max(Math.floor(Date.now() / 1000), blocks[blocks.length - 1].timestamp + 1);
        const hash = await mine(req, timestamp);
        if (onTransaction) onTransaction({ from: req.from, to: req.to || null, data: req.data || req.input || "0x", value: hex(BigInt(req.value || 0)), timestamp });
        return hash;
      }
      case "eth_getTransactionByHash": return txs[params[0]] ? txs[params[0]].tx : null;
      case "eth_getTransactionReceipt": return txs[params[0]] ? txs[params[0]].receipt : null;
      case "eth_getBlockByNumber": return formatBlock(blockByTag(params[0]));
      case "eth_getBlockByHash": return formatBlock(blocks.find((b) => b.hash === params[0]));
      case "eth_getLogs": {
        const filter = params[0] || {};
        const from = filter.fromBlock ? blockByTag(filter.fromBlock).number : 0;
        const to = filter.toBlock ? blockByTag(filter.toBlock).number : blocks.length - 1;
        return logs.filter((log) => matchLog(log, filter, from, to));
      }
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain": return null;
      default: throw rpcError(4200, "Method not supported in demo mode: " + method);
    }
  }

  return {
    accounts,
    request,
    selectAccount(index) { selected = Math.min(Math.max(index, 0), accounts.length - 1); },
    /** Gửi giao dịch nội bộ (khi dựng dữ liệu mẫu), với mốc thời gian tuỳ chọn. */
    async seed(req, timestamp) {
      const hash = await mine(req, timestamp);
      if (onTransaction) onTransaction({ from: req.from, to: req.to || null, data: req.data || "0x", value: hex(BigInt(req.value || 0)), timestamp });
      return txs[hash].receipt;
    },
  };
}
