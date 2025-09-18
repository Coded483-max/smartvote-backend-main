const fs = require("fs");
const path = require("path");
const { buildPoseidon } = require("circomlibjs");

// Load the witness calculator
const wcBuilder = require("../build/vote/vote_js/witness_calculator.js");

async function generateWitness({ voterId, candidateId, electionId, salt }) {
  // 1️⃣ Build Poseidon
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // 2️⃣ Compute hashes
  const nullifierHash = F.toObject(
    poseidon([BigInt(voterId), BigInt(electionId)])
  );
  const commitmentHash = F.toObject(
    poseidon([BigInt(candidateId), BigInt(salt)])
  );

  console.log("Computed nullifierHash:", nullifierHash.toString());
  console.log("Computed commitmentHash:", commitmentHash.toString());

  // 3️⃣ Prepare input JSON
  const input = {
    voterId: voterId.toString(),
    candidateId: candidateId.toString(),
    electionId: electionId.toString(),
    salt: salt.toString(),
    nullifierHash: nullifierHash.toString(),
    commitmentHash: commitmentHash.toString(),
  };

  // 4️⃣ Load WASM
  const wasmPath = path.join(__dirname, "../build/vote/vote_js/vote.wasm");
  const buffer = fs.readFileSync(wasmPath);
  const wc = await wcBuilder(buffer);

  // 5️⃣ Calculate witness
  const witness = await wc.calculateWTNSBin(input, 0);

  // 6️⃣ Write witness file
  const outPath = path.join(__dirname, "../build/vote/witness.wtns");
  fs.writeFileSync(outPath, witness);

  console.log("✅ Witness generated at:", outPath);
}

// Example usage
generateWitness({
  voterId: 123,
  candidateId: 456,
  electionId: 789,
  salt: 987654321,
}).catch(console.error);
