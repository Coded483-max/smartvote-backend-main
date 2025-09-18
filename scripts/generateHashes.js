const circomlibjs = require("circomlibjs");

async function generateHashes(candidateId, salt, voterId, electionId) {
  const poseidon = await circomlibjs.buildPoseidon();

  const candidateField = BigInt(candidateId);
  const saltField = BigInt(salt);
  const voterField = BigInt(voterId);
  const electionField = BigInt(electionId);

  const commitmentHash = poseidon([candidateField, saltField]);
  const nullifierHash = poseidon([voterField, electionField]);

  // Convert to decimal string
  const F = circomlibjs.bigInt;
  return {
    commitmentHash: F.toString(commitmentHash),
    nullifierHash: F.toString(nullifierHash),
  };
}
generateHashes;
