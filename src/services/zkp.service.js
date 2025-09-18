// services/zkp.service.js
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class ZKPService {
  constructor() {
    this.buildDir = path.join(__dirname, "../../build");
    this.nullifiers = new Set(); // Track used nullifiers
  }

  // Generate proof for a vote
  async generateVoteProof(voterId, candidateId, electionId) {
    try {
      const salt = this.generateSalt();

      // Calculate public inputs
      const nullifierHash = await this.calculateNullifierHash(
        voterId,
        electionId
      );
      const commitmentHash = await this.calculateCommitmentHash(
        voterId,
        candidateId,
        electionId,
        salt
      );
      const electionRoot = await this.getElectionRoot(electionId);

      // Check for double voting
      if (this.nullifiers.has(nullifierHash.toString())) {
        throw new Error("Vote already cast (double voting detected)");
      }

      // Prepare circuit inputs
      const input = {
        voterId: voterId,
        candidateId: candidateId,
        electionId: electionId,
        salt: salt,
        nullifierHash: nullifierHash,
        commitmentHash: commitmentHash,
        electionRoot: electionRoot,
      };

      // Generate proof
      const wasmPath = path.join(this.buildDir, "vote", "vote_js", "vote.wasm");
      const zkeyPath = path.join(this.buildDir, "vote", "vote_final.zkey");

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        wasmPath,
        zkeyPath
      );

      // Store nullifier to prevent double voting
      this.nullifiers.add(nullifierHash.toString());

      return {
        proof,
        publicSignals,
        nullifierHash,
        commitmentHash,
        valid: true,
      };
    } catch (error) {
      console.error("ZKP generation error:", error);
      throw new Error(`Failed to generate vote proof: ${error.message}`);
    }
  }

  // Verify a vote proof
  async verifyVoteProof(proof, publicSignals) {
    try {
      const vkeyPath = path.join(
        this.buildDir,
        "vote",
        "vote_verification_key.json"
      );
      const vKey = JSON.parse(fs.readFileSync(vkeyPath));

      const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

      if (!isValid) {
        throw new Error("Invalid proof");
      }

      // Additional verification checks
      const [nullifierHash, commitmentHash, electionRoot] = publicSignals;

      // Check if nullifier already used
      if (this.nullifiers.has(nullifierHash)) {
        throw new Error("Nullifier already used (double voting)");
      }

      return {
        valid: true,
        nullifierHash,
        commitmentHash,
        electionRoot,
      };
    } catch (error) {
      console.error("ZKP verification error:", error);
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  // Calculate nullifier hash (prevents double voting)
  async calculateNullifierHash(voterId, electionId) {
    const poseidon = await import("circomlib").then((m) => m.poseidon);
    return poseidon([BigInt(voterId), BigInt(electionId)]);
  }

  // Calculate commitment hash (hides vote details)
  async calculateCommitmentHash(voterId, candidateId, electionId, salt) {
    const poseidon = await import("circomlib").then((m) => m.poseidon);
    return poseidon([
      BigInt(voterId),
      BigInt(candidateId),
      BigInt(electionId),
      BigInt(salt),
    ]);
  }

  // Get election merkle root
  async getElectionRoot(electionId) {
    // This should fetch the actual merkle root from your database
    // For now, return a placeholder
    return BigInt("0x" + crypto.randomBytes(32).toString("hex"));
  }

  // Generate random salt
  generateSalt() {
    return BigInt("0x" + crypto.randomBytes(16).toString("hex"));
  }

  // Batch verify multiple proofs
  async batchVerifyProofs(proofs) {
    const results = [];

    for (const { proof, publicSignals } of proofs) {
      const result = await this.verifyVoteProof(proof, publicSignals);
      results.push(result);
    }

    return results;
  }

  // Get nullifier status
  isNullifierUsed(nullifierHash) {
    return this.nullifiers.has(nullifierHash.toString());
  }

  // Clear nullifiers (for testing)
  clearNullifiers() {
    this.nullifiers.clear();
  }
}

module.exports = new ZKPService();
