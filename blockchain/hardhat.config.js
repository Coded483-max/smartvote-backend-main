require("dotenv").config({ path: ".env.blockchain" });
require("@nomicfoundation/hardhat-toolbox");
//require("hardhat-gas-reporter");

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC,
      accounts: [process.env.SEPOLIA_PRIVATE_KEY],
    },
    // Add localhost network
    localhost: {
      url: "http://127.0.0.1:8545",
      accounts: [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Account #0
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Account #1
      ],
    },
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    showTimeSpent: true,
    // Fail CI if vote() ever exceeds 45 k gas
    maxMethodDiff: { vote: 45000 },
  },
};
