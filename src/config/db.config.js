const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Connection pooling for high concurrency
      maxPoolSize: 50, // Maximum 50 connections
      minPoolSize: 5, // Minimum 5 connections
      maxIdleTimeMS: 30000, // Close connections after 30s idle
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,

      // Performance optimizations
      readPreference: "secondaryPreferred", // Read from secondary when possible
      writeConcern: { w: "majority", j: true },
    });

    // Disable mongoose buffering (modern way)
    mongoose.set("bufferCommands", false);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(
      `🔧 Connection pool: ${
        conn.connection.db.s.options.maxPoolSize || "default"
      } max connections`
    );
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);

    // More detailed error logging
    if (error.code === "ENOTFOUND") {
      console.error("💡 Check your MONGO_URI in .env file");
    } else if (error.code === "ECONNREFUSED") {
      console.error("💡 MongoDB server is not running or unreachable");
    } else if (error.name === "MongoAuthenticationError") {
      console.error("💡 Check your MongoDB username/password");
    }

    process.exit(1); // Stop the app if database connection fails
  }
};

// Handle connection events
mongoose.connection.on("connected", () => {
  console.log("🔗 Mongoose connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ Mongoose disconnected from MongoDB");
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("🔒 MongoDB connection closed through app termination");
  process.exit(0);
});

module.exports = connectDB;
