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

async function submitVoteToBlockchain(electionId, candidateId, zkProof) {
  console.log("[v2] submitVoteToBlockchain called with:", {
    electionId,
    candidateId,
    zkProof: zkProof
      ? { ...zkProof, nullifierHash: zkProof.nullifierHash }
      : null,
  });

  if (!zkProof) throw new Error("zkProof is required");

  try {
    // Convert IDs
    const electionIdBigInt =
      typeof electionId === "string"
        ? BigInt("0x" + electionId)
        : BigInt(electionId);
    const candidateIdBigInt = objectIdToBigInt(candidateId);

    console.log("[v2] Converted IDs to BigInt:", {
      electionIdBigInt,
      candidateIdBigInt,
    });

    // Fetch election from contract
    const election = await contract.getElection(electionIdBigInt);
    console.log("[v2] Raw on-chain election:", election);

    if (!election.exists)
      throw new Error(`Election ${electionId} does not exist on-chain`);

    // Check times (ensure all in seconds)
    const startTime = BigInt(election.startTime);
    const endTime = BigInt(election.endTime);
    const now = BigInt(Math.floor(Date.now() / 1000));

    console.log("[v2] Election times (seconds):", {
      startTime: startTime.toString(),
      endTime: endTime.toString(),
      now: now.toString(),
    });

    if (now < startTime) console.warn("Election has not started yet");
    if (now > endTime) console.warn("Election has already ended");

    if (now < startTime || now > endTime) {
      throw new Error(
        `Election not active. Start: ${startTime}, End: ${endTime}, Now: ${now}`
      );
    }

    // Check if voter has already voted
    const hasVoted = await contract.hasVoterVoted(
      electionIdBigInt,
      signer.address
    );
    if (hasVoted) throw new Error("Voter has already voted");

    // Check candidate validity
    const candidateVotes = await contract.getVotes(
      electionIdBigInt,
      candidateIdBigInt
    );
    if (candidateVotes === undefined)
      throw new Error("Candidate ID is invalid for this election");

    console.log("✅ Pre-vote validation passed");

    // Extract zkProof components
    const a = zkProof.proof.pi_a.slice(0, 2).map(BigInt);
    const b = zkProof.proof.pi_b
      .slice(0, 2)
      .map((row) => row.slice(0, 2).map(BigInt));
    const c = zkProof.proof.pi_c.slice(0, 2).map(BigInt);
    const input = [BigInt(zkProof.publicSignals[0])];

    console.log("[v2] Calling contract.vote...");
    const tx = await contract.vote(
      electionIdBigInt,
      candidateIdBigInt,
      a,
      b,
      c,
      input
    );

    console.log("[v2] Transaction sent, waiting for confirmation...");
    const receipt = await tx.wait();

    console.log(
      `[v2] Vote submitted: txHash=${receipt.transactionHash}, blockNumber=${receipt.blockNumber}`
    );

    return {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
    };
  } catch (err) {
    console.error("[submitVoteToBlockchain] Error:", {
      message: err.message,
      stack: err.stack,
      electionId,
      candidateId,
      zkProof,
    });
    throw new Error(`Blockchain submission failed: ${err.message}`);
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
