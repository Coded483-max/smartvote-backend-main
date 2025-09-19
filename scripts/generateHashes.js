const circomlibjs = require("circomlibjs");

async function generateHashes(candidateId, salt, voterId, electionId) {
  const poseidon = await circomlibjs.buildPoseidon();

  const F = poseidon.F;

  const commitmentHash = poseidon([BigInt(candidateId), BigInt(salt)]);
  const nullifierHash = poseidon([BigInt(voterId), BigInt(electionId)]);

  return {
    commitmentHash: F.toString(commitmentHash),
    nullifierHash: F.toString(nullifierHash),
  };
}

generateHashes(7, 987654321, 12345, 2025).then(console.log);
