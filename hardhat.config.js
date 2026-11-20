require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { SEPOLIA_RPC_URL, PRIVATE_KEY } = process.env;

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // Mạng local: chạy `npm run node` ở một terminal riêng
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    // Testnet Sepolia: cần SEPOLIA_RPC_URL và PRIVATE_KEY trong file .env
    ...(SEPOLIA_RPC_URL && PRIVATE_KEY
      ? { sepolia: { url: SEPOLIA_RPC_URL, accounts: [PRIVATE_KEY], chainId: 11155111 } }
      : {}),
  },
};
