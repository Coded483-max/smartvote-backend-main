const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const Admin = require("../src/models/admin.model"); // Adjust path if needed

const resetSuperAdminPassword = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Connected to MongoDB Atlas");

    const email = process.env.SUPER_ADMIN_EMAIL;
    const newPassword = process.env.SUPER_ADMIN_PASSWORD;

    if (!email || !newPassword) {
      console.log("❌ Missing email or password in .env");
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedAdmin = await Admin.findOneAndUpdate(
      { email },
      { password: hashedPassword },
      { new: true }
    );

    if (!updatedAdmin) {
      console.log("❌ Super Admin not found.");
    } else {
      console.log("✅ Super Admin password updated successfully.");
    }

  } catch (error) {
    console.error("Error updating Super Admin password:", error.message);
  } finally {
    mongoose.connection.close();
  }
};

resetSuperAdminPassword();
