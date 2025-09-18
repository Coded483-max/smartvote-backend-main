const { ethers } = require("ethers");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function testContract() {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

    // Check if contract exists
    const code = await provider.getCode(process.env.CONTRACT_ADDRESS);

    if (code === "0x") {
      console.log("❌ No contract deployed at this address");
      console.log("💡 You need to deploy your contract first");
    } else {
      console.log("✅ Contract found!");
      console.log("📋 Contract address:", process.env.CONTRACT_ADDRESS);
      console.log("🔧 Contract bytecode length:", code.length, "characters");
    }
  } catch (error) {
    console.error("❌ Contract test failed:", error.message);
  }
}

testContract();
