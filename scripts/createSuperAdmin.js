const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// Adjust the path based on your project structure
const Admin = require("../src/models/admin.model");

const createSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB Atlas");

    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;

    if (!email || !password) {
      throw new Error("Super admin email or password is missing in .env");
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      console.log("Super Admin already exists.");
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const superAdmin = new Admin({
      firstName: "Super",
      lastName: "Admin",
      email,
      password: hashedPassword,
      role: "super-admin",
    });

    await superAdmin.save();
    console.log("Super Admin created successfully.");
  } catch (error) {
    console.error("Error creating Super Admin:", error.message);
  } finally {
    mongoose.connection.close();
  }
};

createSuperAdmin();
