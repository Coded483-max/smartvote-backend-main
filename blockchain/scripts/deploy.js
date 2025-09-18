const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  // Deploy Groth16Verifier first
  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("Groth16Verifier deployed to:", verifierAddress);

  // Deploy SmartVoteV2, passing verifier address to constructor
  const SV = await hre.ethers.getContractFactory("SmartVoteV2");
  const sv = await SV.deploy(); // <-- pass verifier address here
  await sv.waitForDeployment();

  const address = await sv.getAddress();
  console.log("SmartVoteV2 deployed to:", address);

  /* ── export ABI + address for backend ── */
  const artifact = await hre.artifacts.readArtifact("SmartVoteV2");
  fs.mkdirSync("../artifacts-export", { recursive: true });
  fs.writeFileSync(
    path.join("../artifacts-export", "SmartVote.json"),
    JSON.stringify({ address, abi: artifact.abi }, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
