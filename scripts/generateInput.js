const fs = require("fs");
const circomlibjs = require("circomlibjs");

async function generateVoteInput() {
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;

  // Example private inputs (replace with your own)
  const voterId = 12345n;
  const candidateId = 7n;
  const electionId = 2025n;
  const salt = 987654321n;

  // Compute public hashes
  const nullifierHash = F.toString(poseidon([voterId, electionId]));
  const commitmentHash = F.toString(poseidon([candidateId, salt]));

  // Prepare input JSON
  const input = {
    voterId: voterId.toString(),
    candidateId: candidateId.toString(),
    electionId: electionId.toString(),
    salt: salt.toString(),
    nullifierHash,
    commitmentHash,
  };

  // Save to file
  fs.writeFileSync("circuits/vote_input.json", JSON.stringify(input, null, 2));

  console.log("✅ vote_input.json generated successfully!");
  console.log(input);
}

generateVoteInput().catch((err) => console.error(err));
