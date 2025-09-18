// debug-routes-detailed.js
require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");

// Get all route files from your routes directory
const routesDir = "./src/routes";
const routeFiles = fs
  .readdirSync(routesDir)
  .filter((file) => file.endsWith(".routes.js"))
  .map((file) => path.join(routesDir, file));

console.log("Found route files:", routeFiles);

async function testRoutesIndividually() {
  for (const routeFile of routeFiles) {
    console.log(`\n🔍 Testing: ${routeFile}`);

    try {
      // Create a fresh app for each test
      const app = express();

      // Add basic middleware that routes might expect
      app.use(express.json());
      app.use((req, res, next) => {
        req.session = {}; // Mock session
        req.voter = { _id: "test-voter-id" }; // Mock voter
        req.admin = { _id: "test-admin-id" }; // Mock admin
        next();
      });

      // Try to load the router
      const router = require(path.resolve(routeFile));

      // Try to mount it
      app.use("/test", router);

      console.log(`✅ ${routeFile} - OK`);
    } catch (error) {
      console.error(`❌ ${routeFile} - ERROR:`, error.message);

      // Check for path-to-regexp specific errors
      if (error.message.includes("Missing parameter name")) {
        console.error("🚨 This is the file causing the path-to-regexp error!");
        console.error("Look for malformed route patterns like:");
        console.error('  - router.get("/:") - missing parameter name');
        console.error(
          '  - router.post("/:id/") - trailing slash after parameter'
        );
        console.error(
          '  - router.put("/user:id") - missing slash before parameter'
        );
      }

      if (process.env.NODE_ENV === "development") {
        console.error("Full stack:", error.stack);
      }
    }
  }
}

// Also test loading them all together (like in your app.js)
async function testAllTogether() {
  console.log("\n\n🔍 Testing all routes together...");

  try {
    const app = express();
    app.use(express.json());

    // Mock middleware
    app.use((req, res, next) => {
      req.session = {};
      req.voter = { _id: "test-voter-id" };
      req.admin = { _id: "test-admin-id" };
      next();
    });

    // Load routes in the same order as your app.js
    const routesToTest = [
      { path: "./src/routes/index.routes", mount: "/api" },
      { path: "./src/routes/session.routes", mount: "/api/session" },
      { path: "./src/routes/voter.routes", mount: "/api/voters" },
      { path: "./src/routes/candidate.routes", mount: "/api/candidates" },
      { path: "./src/routes/notification.routes", mount: "/api/notifications" },
      { path: "./src/routes/position.routes", mount: "/api/positions" },
    ];

    for (const route of routesToTest) {
      try {
        if (fs.existsSync(route.path + ".js")) {
          const router = require(path.resolve(route.path));
          app.use(route.mount, router);
          console.log(`✅ Loaded: ${route.mount}`);
        } else {
          console.log(`⚠️  Skipped: ${route.path} (not found)`);
        }
      } catch (error) {
        console.error(`❌ Failed to load ${route.path}:`, error.message);
        throw error; // Stop on first error
      }
    }

    console.log("✅ All routes loaded successfully together");
  } catch (error) {
    console.error("❌ Error loading routes together:", error.message);
  }
}

testRoutesIndividually().then(() => testAllTogether());
