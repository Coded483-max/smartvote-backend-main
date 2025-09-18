const {
  contract,
  contractRO,
  testConnection,
} = require("../src/services/blockchain");

async function testService() {
  console.log("🧪 Testing blockchain service...");

  await testConnection();

  console.log("Contract methods available:");
  console.log("- contract (write):", typeof contract);
  console.log("- contractRO (read):", typeof contractRO);

  console.log("✅ Blockchain service test complete!");
}

testService();
