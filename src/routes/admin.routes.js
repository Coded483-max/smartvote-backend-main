// routes/admin.routes.js
const express = require("express");
const {
  loginAdmin,
  createAdmin,
  approveCandidate,
  loginSuperAdmin,
  logoutSuperAdmin,
  logoutAdmin,
  getAllAdmins,
  getCandidatesByElection,
  getCandidatesByPosition,
  getAllElectionsForAdmin,
  getElectionStatusHistory,
  updateElectionStatus,
} = require("../controllers/admin.controller");
const { rejectCandidate } = require("../controllers/candidate.controller");
const {
  getActiveElections,
  getElectionPositions,
} = require("../controllers/election.controller");
const {
  verifySuperAdmin,
  verifyAdmin,
} = require("../middlewares/auth.middleware");
const { authLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();

// ✅ AUTHENTICATION ROUTES - Keep at top
router.post("/login", authLimiter, loginAdmin);
router.post("/logout", logoutAdmin);
router.post("/super-login", loginSuperAdmin);
router.post("/super-logout", logoutSuperAdmin);

// ✅ ADMIN MANAGEMENT ROUTES
router.post("/create", verifySuperAdmin, createAdmin);
router.get("/admins", verifySuperAdmin, getAllAdmins);

// ✅ CANDIDATE MANAGEMENT ROUTES - Specific routes BEFORE generic ones
router.put(
  "/candidates/:candidateId/approve",
  // authLimiter,
  verifyAdmin,
  approveCandidate
);
router.put(
  "/candidates/:candidateId/reject",
  authLimiter,
  verifyAdmin,
  rejectCandidate
);

// ✅ ELECTION ROUTES - Specific routes BEFORE generic ones
router.get("/elections/active", verifyAdmin, getActiveElections);
router.get("/elections", verifyAdmin, getAllElectionsForAdmin);
router.get(
  "/elections/:electionId/candidates",
  verifyAdmin,
  getCandidatesByElection
);
router.get(
  "/elections/:electionId/positions",
  verifyAdmin,
  getElectionPositions
);
router.get(
  "/elections/:electionId/positions/:positionId/candidates",
  verifyAdmin,
  getCandidatesByPosition
);
router.patch(
  "/elections/:electionId/status",
  verifyAdmin,
  updateElectionStatus
);

// ✅ ELECTION STATUS HISTORY - Fixed route pattern
router.get(
  "/elections/:electionId/status-history",
  verifyAdmin,
  getElectionStatusHistory
);

module.exports = router;
