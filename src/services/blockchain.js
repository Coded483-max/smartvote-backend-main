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

const { ObjectId } = require("mongodb");

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
      // ─────────── Core election management ───────────
      "function createElection(string _title, uint256 _startTime, uint256 _endTime) external returns (uint256)",
      "function getElection(uint256 _electionId) external view returns (bool exists, uint256 startTime, uint256 endTime)",
      "function electionCount() external view returns (uint256)",
      "function owner() external view returns (address)",

      // ─────────── Voting (ZK-SNARK) ───────────
      "function vote(uint256 _electionId, uint256 _candidateId, uint[2] a, uint[2][2] b, uint[2] c, uint256[3] input) external",
      "function getVotes(uint256 _electionId, uint256 _candidateId) external view returns (uint256)",
      "function isNullifierUsed(uint256 _electionId, uint256 nullifier) external view returns (bool)",

      // ─────────── Events ───────────
      "event ElectionCreated(uint256 indexed id, string title)",
      "event VoteCast(uint256 indexed electionId, uint256 indexed candidateId, uint256 nullifierHash, uint256 commitmentHash)",
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

/**
 * Submit a vote to the blockchain
 * @param {string|number} electionId
 * @param {string|number} candidateId
 * @param {Object} zkProof - Zero-knowledge proof object containing nullifierHash and optional commitmentHash
 * @returns {Promise<{txHash: string, blockNumber: number}>}
 */
function toBigIntFromHex(value) {
  console.log("[v1] toBigIntFromHex called with:", {
    value,
    type: typeof value,
  });

  if (!value) throw new Error("Value is required for BigInt conversion");

  // Handle number or BigInt
  if (typeof value === "number" || typeof value === "bigint")
    return BigInt(value);

  // Handle string
  if (typeof value === "string") {
    const cleanValue = value.trim();
    if (!/^[0-9a-fA-F]+$/.test(cleanValue)) {
      throw new Error(`Invalid hex string format: ${cleanValue}`);
    }
    return BigInt("0x" + cleanValue);
  }

  // Handle MongoDB ObjectId
  if (value instanceof ObjectId) {
    return BigInt("0x" + value.toHexString());
  }

  throw new Error(`Invalid value type for BigInt conversion: ${typeof value}`);
}

function isValidObjectId(id) {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

function objectIdToBigInt(objectId) {
  let hex;

  if (typeof objectId === "string" && /^[0-9a-fA-F]{24}$/.test(objectId)) {
    hex = objectId;
  } else if (objectId instanceof ObjectId) {
    hex = objectId.toHexString();
  } else {
    throw new Error(`Invalid MongoDB ObjectId: ${objectId}`);
  }

  return BigInt("0x" + hex);
}

// async function submitVoteToBlockchain(electionId, candidateId, zkProof) {
//   console.log("[v2] submitVoteToBlockchain called with:", {
//     electionId,
//     candidateId,
//     zkProof: zkProof
//       ? { ...zkProof, nullifierHash: zkProof.nullifierHash }
//       : null,
//   });

//   if (!zkProof) throw new Error("zkProof is required");

//   try {
//     // zkProof is assumed to have `proof` and `publicSignals`
//     const a = [zkProof.proof.pi_a[0], zkProof.proof.pi_a[1]];
//     const b = [
//       [zkProof.proof.pi_b[0][0], zkProof.proof.pi_b[0][1]],
//       [zkProof.proof.pi_b[1][0], zkProof.proof.pi_b[1][1]],
//     ];
//     const c = [zkProof.proof.pi_c[0], zkProof.proof.pi_c[1]];

//     // publicSignals = [nullifierHash, commitmentHash, 1]
//     const input = [
//       zkProof.publicSignals[0],
//       zkProof.publicSignals[1],
//       zkProof.publicSignals[2],
//     ];

//     console.log("📥 Submitting vote with params:", { a, b, c, input });

//     const tx = await contract.vote(electionId, candidateId, a, b, c, input);
//     const receipt = await tx.wait();

//     console.log(`✅ Vote cast! TxHash=${receipt.transactionHash}`);
//   } catch (err) {
//     console.error("❌ Vote submission failed:", err);
//   }
// }

/**
 * Submit a vote to the SmartVote contract
 * @param {string|number|BigInt} blockchainElectionId - On-chain election ID
 * @param {string|number|BigInt} candidateId - Candidate ID
 * @param {object} zkProof - ZK proof object (with proof & signals)
 * @returns {Promise<{ txHash: string, blockNumber: number }>}
 */
async function submitVoteToBlockchain(
  blockchainElectionId,
  candidateId,
  zkProof
) {
  try {
    // ✅ Convert to BigInt to avoid overflow
    const electionIdBN = BigInt(blockchainElectionId);
    const candidateIdBN = BigInt(candidateId);

    const { proof, publicSignals } = zkProof;

    if (!proof || !publicSignals) {
      throw new Error("Missing zkProof data");
    }

    // zkSNARK proof fields (Groth16)
    const a = [proof.pi_a[0].toString(), proof.pi_a[1].toString()];
    const b = [
      [proof.pi_b[0][0].toString(), proof.pi_b[0][1].toString()],
      [proof.pi_b[1][0].toString(), proof.pi_b[1][1].toString()],
    ];
    const c = [proof.pi_c[0].toString(), proof.pi_c[1].toString()];

    // Public signals (nullifier, commitment, etc.)
    // adjust order if your circuit defines differently
    const input = publicSignals.map((x) => x.toString());

    // 📝 Call vote()
    const tx = await contract.vote(electionIdBN, candidateIdBN, a, b, c, input);
    const receipt = await tx.wait();

    return {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
    };
  } catch (err) {
    console.error("[submitVoteToBlockchain] Error:", err);
    throw new Error("Failed to submit vote to blockchain: " + err.message);
  }
}

module.exports = {
  contract,
  contractRO,
  provider,
  wallet,
  testConnection,
  submitVoteToBlockchain,
};
