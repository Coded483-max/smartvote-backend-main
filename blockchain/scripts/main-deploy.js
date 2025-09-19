// scripts/main-deploy.js
const hre = require("hardhat");

async function main() {
  // 1️⃣ Deploy Verifier
  const Verifier = await hre.ethers.getContractFactory(
    "contracts/Groth16Verifier.sol:Groth16Verifier"
  );
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("✅ Verifier deployed at:", verifierAddress);

  // 2️⃣ Deploy SmartVote with verifier
  const SmartVote = await hre.ethers.getContractFactory("SmartVote");
  const smartVote = await SmartVote.deploy(verifierAddress);
  await smartVote.waitForDeployment();
  const smartVoteAddress = await smartVote.getAddress();
  console.log("✅ SmartVote deployed at:", smartVoteAddress);

  // 3️⃣ Interact
  const electionCount = await smartVote.electionCount();
  console.log("📊 Current election count:", electionCount.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
