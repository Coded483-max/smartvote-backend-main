const express = require("express");
const router = express.Router();

const {
  /* CRUD & config */
  createElection,
  getAllElections,
  getElectionById,
  updateElectionConfig,
  deleteElection,

  getAvailableElections,
  getElectionPositions,
  checkCandidateEligibility,
  getActiveElections,

  /* Lifecycle */
  startVoting,
  pauseVoting,
  endVoting,
  toggleCandidateRegistration,
  setCandidateRequirements,

  /* Results & analytics */
  getLiveResultsChain,
  exportVotesRaw,
  exportResultsCSV,
  votesAnalytics,
  publishResults,
  getElectionsForVoter,
  getActiveElectionsForRegistration,
  getElectionPositionsForRegistration,
  getElectionByIdForAdmins,
  getElectionTurnout,
} = require("../controllers/election.controller");

const {
  verifyAdmin,
  verifySuperAdmin,
  verifyVoter,
} = require("../middlewares/auth.middleware");

const { authLimiter } = require("../middlewares/rateLimiter");

/* ───────────── ✅ SPECIFIC ROUTES FIRST (BEFORE PARAMETERIZED ROUTES) ───────────── */
router.get("/available", getAvailableElections);

// Get active elections available for candidate registration
router.get("/public/active", getActiveElections);

// Get active elections for registration
router.get("/public/active/registration", getActiveElectionsForRegistration);

// Check candidate eligibility
router.get("/public/check-eligibility", checkCandidateEligibility);

//Get election voters turnout
router.get("/public/:electionId/voters-turnout", getElectionTurnout);

// Get positions for selected election
router.get(
  "/public/:electionId/positions",
  getElectionPositionsForRegistration
);

/* ───────────── Public / Admin endpoints ───────────── */
router.post("/create", verifyAdmin, createElection);
router.get("/", getAllElections);
router.get("/my-elections", verifyVoter, getElectionsForVoter);

/* ───────────── ✅ PARAMETERIZED ROUTES AFTER SPECIFIC ROUTES ───────────── */
router.get("/public/:electionId", getElectionById);
router.get("/:electionId", verifyAdmin, getElectionByIdForAdmins);
router.get("/:electionId/positions", getElectionPositions);
router.get("/:electionId/eligibility", checkCandidateEligibility);

router.put(
  "/:electionId/config",
  authLimiter,
  verifyAdmin,
  updateElectionConfig
);
router.put("/:electionId/publish", authLimiter, verifyAdmin, publishResults);

/* ───────────── Super-admin lifecycle controls ───────────── */
router.put("/:electionId/start", authLimiter, verifySuperAdmin, startVoting);
router.put("/:electionId/pause", authLimiter, verifySuperAdmin, pauseVoting);
router.put("/:electionId/end", authLimiter, verifySuperAdmin, endVoting);

router.put(
  "/:electionId/toggle-candidate-reg",
  authLimiter,
  verifySuperAdmin,
  toggleCandidateRegistration
);

router.put(
  "/:electionId/candidate-requirements",
  authLimiter,
  verifySuperAdmin,
  setCandidateRequirements
);

/* ───────────── Results, export & analytics ───────────── */
router.get(
  "/:electionId/live-results",
  authLimiter,
  verifyAdmin,
  getLiveResultsChain
);

router.get("/:electionId/votes", authLimiter, verifyAdmin, exportVotesRaw);

router.get(
  "/:electionId/export-csv",
  authLimiter,
  verifySuperAdmin,
  exportResultsCSV
);

router.get(
  "/:electionId/analytics",
  authLimiter,
  verifySuperAdmin,
  votesAnalytics
);

/* ───────────── Destructive action ───────────── */
router.delete("/:electionId", authLimiter, verifySuperAdmin, deleteElection);

module.exports = router;
