// scripts/checkContractFunctions.js
const { contractRO, provider } = require("../src/services/blockchain");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function checkContractFunctions() {
  try {
    console.log("🔍 Checking deployed contract functions...");
    console.log("📋 Contract address:", process.env.CONTRACT_ADDRESS);

    // Check if contract exists
    const code = await provider.getCode(process.env.CONTRACT_ADDRESS);
    if (code === "0x") {
      console.log("❌ No contract deployed at this address!");
      return;
    }

    console.log("✅ Contract found");
    console.log("🔧 Contract bytecode length:", code.length);

    // Try to get the contract interface
    console.log("\n📝 Available contract functions:");
    const contractInterface = contractRO.interface;

    contractInterface.forEachFunction((func, index) => {
      console.log(
        `${index + 1}. ${func.name}(${func.inputs
          .map((i) => i.type)
          .join(", ")}) ${func.stateMutability}`
      );
    });

    console.log("\n📝 Available contract events:");
    contractInterface.forEachEvent((event, index) => {
      console.log(
        `${index + 1}. ${event.name}(${event.inputs
          .map((i) => i.type)
          .join(", ")})`
      );
    });
  } catch (error) {
    console.error("❌ Error checking contract:", error.message);
  }
}

checkContractFunctions();
