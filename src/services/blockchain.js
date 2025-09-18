// const path = require("path");
// const fs   = require("fs");
// const { ethers } = require("ethers");

// /* ───────────────────────── Load .env.blockchain ───────────────────────── */
// require("dotenv").config({
//   path: path.join(__dirname, "../../.env"),
// });
// require("dotenv").config({
//   path: path.join(__dirname, "../../blockchain/.env.blockchain"),
//   override: true,
// });

// /* ───────────────────────── Read ABI & address ───────────────────────── */
// const ABI_PATH = path.join(
//   __dirname,
//   "../../blockchain/artifacts-export/SmartVote.json"
// );
// const { abi } = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));

// const address = process.env.CONTRACT_ADDRESS;
// const rpcUrl  = process.env.SEPOLIA_RPC;
// const privKey = process.env.SEPOLIA_PRIVATE_KEY;

// if (!address) throw new Error("CONTRACT_ADDRESS missing in .env");
// if (!rpcUrl || !privKey) throw new Error("SEPOLIA_RPC or SEPOLIA_PRIVATE_KEY missing");

// /* ───────────────────────── Provider & signer ───────────────────────── */
// const provider = new ethers.JsonRpcProvider(rpcUrl);
// const wallet   = new ethers.Wallet(privKey, provider);

// const contract    = new ethers.Contract(address, abi, wallet);   // write
// const contractRO  = contract.connect(provider);                  // read-only

// module.exports = { contract, contractRO };

const path = require("path");
const fs = require("fs");
const { ethers } = require("ethers");

/* ───────────────────────── Load environment variables ───────────────────────── */
require("dotenv").config({
  path: path.join(__dirname, "../../.env"),
});
require("dotenv").config({
  path: path.join(__dirname, "../../blockchain/.env.blockchain"),
  override: false, // Don't override main .env values
});

/* ───────────────────────── Read ABI & address ───────────────────────── */
const ABI_PATH = path.join(
  __dirname,
  "../../blockchain/artifacts/contracts/SmartVote.sol/SmartVote.json"
);

let abi;
try {
  if (fs.existsSync(ABI_PATH)) {
    const contractJson = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));
    abi = contractJson.abi;
    console.log("✅ ABI loaded from artifacts");
  } else {
    console.warn("⚠️ ABI file not found, using minimal ABI");
    // Minimal ABI for basic functionality
    abi = [
      "function castVote(uint256 electionId, uint256 candidateId) external",
      "function getVotes(uint256 electionId, uint256 candidateId) external view returns (uint256)",
      "function hasVoted(uint256 electionId, address voter) external view returns (bool)",
      "event VoteCast(uint256 indexed electionId, uint256 indexed candidateId, address indexed voter)",
    ];
  }
} catch (error) {
  console.error("❌ Error loading ABI:", error.message);
  throw new Error("Failed to load contract ABI");
}

/* ───────────────────────── Environment configuration ───────────────────────── */
const address = process.env.CONTRACT_ADDRESS;

// Use localhost for development, Sepolia for production
const isLocalhost = process.env.NODE_ENV === "development";
const rpcUrl = isLocalhost
  ? process.env.RPC_URL || "http://127.0.0.1:8545"
  : process.env.SEPOLIA_RPC;
const privKey = isLocalhost
  ? process.env.PRIVATE_KEY ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  : process.env.SEPOLIA_PRIVATE_KEY;

// Validation
if (!address) throw new Error("CONTRACT_ADDRESS missing in .env");
if (!rpcUrl) throw new Error("RPC_URL missing for current environment");
if (!privKey) throw new Error("PRIVATE_KEY missing for current environment");

console.log(
  `🔗 Connecting to ${isLocalhost ? "localhost" : "Sepolia"} blockchain...`
);
console.log(`📋 Contract address: ${address}`);
console.log(`🌐 RPC URL: ${rpcUrl}`);

/* ───────────────────────── Provider & signer ───────────────────────── */
const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
  timeout: 30000, // 30 seconds timeout
});

const wallet = new ethers.Wallet(privKey, provider);

const contract = new ethers.Contract(address, abi, wallet); // write operations
const contractRO = new ethers.Contract(address, abi, provider); // read-only operations

/* ───────────────────────── Connection test ───────────────────────── */
async function testConnection() {
  try {
    const blockNumber = await provider.getBlockNumber();
    const balance = await provider.getBalance(wallet.address);
    console.log(`✅ Connected to block ${blockNumber}`);
    console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} ETH`);

    // Test contract
    const code = await provider.getCode(address);
    if (code === "0x") {
      console.warn("⚠️ No contract found at address - deploy contract first");
    } else {
      console.log("✅ Smart contract found");
    }
  } catch (error) {
    console.error("❌ Blockchain connection failed:", error.message);
  }
}

// Test connection on module load
testConnection();

module.exports = {
  contract,
  contractRO,
  provider,
  wallet,
  testConnection,
};
