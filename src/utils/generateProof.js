const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const snarkjs = require("snarkjs");

const ZK_CONFIG = {
  wasmPath: process.env.ZK_WASM_PATH || "./build/vote/vote.wasm",
  zkeyPath: process.env.ZK_ZKEY_PATH || "./build/vote/vote_final.zkey",
  vKeyPath: process.env.ZK_VKEY_PATH || "./build/vote/verification_key.json",
};

const FIELD_PRIME = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

// Safe hash-to-field
function toField(value) {
  const hash = crypto
    .createHash("sha256")
    .update(value.toString())
    .digest("hex");
  const field = BigInt("0x" + hash) % FIELD_PRIME;
  console.log(`[toField] value: ${value} -> field: ${field}`);
  return field;
}

// Generate ZK vote proof
async function generateVoteProof(voterId, candidateId, electionId) {
  try {
    console.log("\n[generateVoteProof] Starting proof generation...");

    const saltField = toField(crypto.randomBytes(32).toString("hex"));

    const voterField = toField(voterId);
    const candidateField = toField(candidateId);
    const electionField = toField(electionId);

    const nullifierHash = toField(voterId + electionId);
    const commitmentHash = toField(candidateId + saltField.toString());

    const input = {
      voterId: voterField.toString(),
      candidateId: candidateField.toString(),
      electionId: electionField.toString(),
      salt: saltField.toString(),
      nullifierHash: nullifierHash.toString(),
      commitmentHash: commitmentHash.toString(),
    };

    console.log("[generateVoteProof] Circuit input:", input);

    const wasmPath = path.resolve(ZK_CONFIG.wasmPath);
    const zkeyPath = path.resolve(ZK_CONFIG.zkeyPath);

    console.log(
      `[generateVoteProof] WASM path: ${wasmPath}, ZKEY path: ${zkeyPath}`
    );
    console.log(
      `[generateVoteProof] File exists? WASM: ${fs.existsSync(
        wasmPath
      )}, ZKEY: ${fs.existsSync(zkeyPath)}`
    );

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath
    );

    console.log("[generateVoteProof] Proof generated successfully.");
    console.log("[generateVoteProof] Public signals:", publicSignals);

    return {
      proof,
      publicSignals,
      nullifierHash,
      commitmentHash,
      salt: saltField,
    };
  } catch (err) {
    console.error("[generateVoteProof] Error generating proof:", err);
    throw new Error("Failed to generate vote proof: " + err.message);
  }
}

// Verify ZK proof
async function verifyVoteProof(proof, publicSignals) {
  console.log("\n[verifyVoteProof] Starting verification...");
  console.log("[verifyVoteProof] Proof:", proof);
  console.log("[verifyVoteProof] Public signals:", publicSignals);

  try {
    const vKeyPath = path.resolve(ZK_CONFIG.vKeyPath);
    console.log(`[verifyVoteProof] Verification key path: ${vKeyPath}`);
    console.log(
      `[verifyVoteProof] File exists? VKey: ${fs.existsSync(vKeyPath)}`
    );

    const vKey = JSON.parse(fs.readFileSync(vKeyPath, "utf8"));
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

    console.log("[verifyVoteProof] Verification result:", isValid);
    return !!isValid;
  } catch (err) {
    console.error("[verifyVoteProof] Error verifying proof:", err);
    return false;
  }
}

// Convert proof to Solidity calldata
async function proofToSolidityArgs(proof, publicSignals) {
  try {
    console.log(
      "\n[proofToSolidityArgs] Converting proof to Solidity calldata..."
    );
    const callData = await snarkjs.groth16.exportSolidityCallData(
      proof,
      publicSignals
    );

    console.log("[proofToSolidityArgs] Raw calldata:", callData);

    const argv = callData.replace(/["\[\]\s]/g, "").split(",");
    if (argv.length < 8)
      throw new Error("Unexpected calldata format from snarkjs");

    const a = [argv[0], argv[1]];
    const b = [
      [argv[2], argv[3]],
      [argv[4], argv[5]],
    ];
    const c = [argv[6], argv[7]];
    const input = argv.slice(8);

    console.log("[proofToSolidityArgs] Parsed calldata:", { a, b, c, input });
    return { a, b, c, input };
  } catch (err) {
    console.error("[proofToSolidityArgs] Error:", err);
    throw err;
  }
}

module.exports = {
  generateVoteProof,
  verifyVoteProof,
  proofToSolidityArgs,
};
