// test-individual-routes.js
require("dotenv").config();

const express = require("express");

const testRoute = (routePath, routeName) => {
  try {
    console.log(`\n🔍 Testing ${routeName}...`);

    const app = express();
    app.use(express.json());

    // Mock session middleware
    app.use((req, res, next) => {
      req.session = { user: null };
      next();
    });

    const router = require(routePath);
    app.use("/test", router);

    console.log(`✅ ${routeName} - SUCCESS`);
    return true;
  } catch (error) {
    console.error(`❌ ${routeName} - FAILED: ${error.message}`);

    if (error.message.includes("Missing parameter name")) {
      console.error(`🚨 MALFORMED ROUTE FOUND IN: ${routePath}`);
    }

    return false;
  }
};

// Test each route file
const routes = [
  ["../src/routes/session.routes.js", "Session Routes"],
  ["../src/routes/index.routes.js", "Index Routes"],
  ["../src/routes/voter.routes.js", "Voter Routes"],
  ["../src/routes/candidate.routes.js", "Candidate Routes"],
  ["../src/routes/position.routes.js", "Position Routes"],
  ["../src/routes/notification.routes.js", "Notification Routes"],
  ["../src/routes/admin.routes.js", "Admin Routes"],
  ["../src/routes/admin.dashboard.routes.js", "Admin Dashboard Routes"],
  [
    "../src/routes/superadmin.dashboard.routes.js",
    "Super Admin Dashboard Routes",
  ],
  ["../src/routes/election.dashboard.routes.js", "Election Dashboard Routes"],
  ["../src/routes/candidate.dashboard.routes.js", "Candidate Dashboard Routes"],
  ["../src/routes/voter.dashboard.routes.js", "Voter Dashboard Routes"],
];

console.log("🔍 Testing all route files individually...");

for (const [path, name] of routes) {
  if (!testRoute(path, name)) {
    console.log("\n🛑 Stopping at first error");
    break;
  }
}

console.log("\n✅ Route testing completed");
