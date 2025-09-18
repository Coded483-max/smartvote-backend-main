const mongoose = require("mongoose");
require("dotenv").config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const db = mongoose.connection.db;
    const indexes = await db.collection("candidates").indexes();
    console.log("📑 Current indexes:", indexes);

    // Drop old single-field indexes if they exist
    if (indexes.some((i) => i.name === "studentId_1")) {
      console.log("🗑 Dropping studentId_1 index...");
      await db.collection("candidates").dropIndex("studentId_1");
    }
    if (indexes.some((i) => i.name === "email_1")) {
      console.log("🗑 Dropping email_1 index...");
      await db.collection("candidates").dropIndex("email_1");
    }

    console.log("✅ Fixed indexes. Now only compound indexes should remain.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error fixing indexes:", err);
    process.exit(1);
  }
})();
