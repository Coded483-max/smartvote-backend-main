const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const Admin = require("../src/models/admin.model"); // Adjust path if needed

const testSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Connected to MongoDB Atlas");

    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;

    const admin = await Admin.findOne({ email });

    if (!admin) {
      console.log("❌ Super Admin not found in database!");
      return;
    }

    console.log("✅ Super Admin found:", admin);

    const passwordMatch = await bcrypt.compare(password, admin.password);
    console.log("Password Match:", passwordMatch ? "✅ Yes" : "❌ No");
  } catch (error) {
    console.error("Error testing Super Admin:", error.message);
  } finally {
    mongoose.connection.close();
  }
};

testSuperAdmin();
