const mongoose = require("mongoose");
const Election = require("../models/election.model");
const Candidate = require("../models/candidate.model");
const Voter = require("../models/voter.model");
const PositionTemplate = require("../models/positionTemplate");
const { contractRO, contract } = require("../services/blockchain");

const { sanitizeString } = require("../utils/sanitizeInput");
const { exportCSV } = require("../utils/csvExporter");

const { sendElectionAnnouncement } = require("../utils/emailService");
const { createElectionNotifications } = require("../services/Notification");

// ✅ Add SecurityLogger import
const SecurityLogger = require("../services/securityLogger");

const VALID_LEVELS = ["departmental", "college", "university", "custom"];

/* ───────────────────────── Create ───────────────────────── */
exports.createElection = async (req, res) => {
  try {
    const title = sanitizeString(req.body.title);
    const description = sanitizeString(req.body.description);
    const level = sanitizeString(req.body.level);
    const customLevelName = sanitizeString(req.body.customLevelName || "");

    // ✅ NEW: Election scope criteria
    const department = sanitizeString(req.body.department || "");
    const college = sanitizeString(req.body.college || "");
    const yearOfStudy = req.body.yearOfStudy
      ? Number(req.body.yearOfStudy)
      : null;

    const startDate = new Date(req.body.startDate);
    const endDate = new Date(req.body.endDate);
    const adminId = req.admin.id;

    const candidateRegStart =
      req.body.candidateRegStart && new Date(req.body.candidateRegStart);
    const candidateRegEnd =
      req.body.candidateRegEnd && new Date(req.body.candidateRegEnd);
    const campaignStart =
      req.body.campaignStart && new Date(req.body.campaignStart);
    const campaignEnd = req.body.campaignEnd && new Date(req.body.campaignEnd);
    const voteStart = req.body.voteStart && new Date(req.body.voteStart);
    const voteEnd = req.body.voteEnd && new Date(req.body.voteEnd);

    /* Eligibility */
    const requireGPA = req.body.requireGPA === true;
    const minGPA = requireGPA ? Number(req.body.minGPA) : undefined;
    const rules = sanitizeString(req.body.rules || "");
    const features = req.body.features || {};

    /* Validation */
    if (!VALID_LEVELS.includes(level)) {
      // ✅ Log invalid election level attempt
      await SecurityLogger.log({
        event: "Election Management",
        user: req.admin.email,
        userId: req.admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Invalid election level provided",
        severity: "Medium",
        category: "Election",
        metadata: {
          invalidLevel: level,
          validLevels: VALID_LEVELS,
          title: title,
          endpoint: "/api/elections",
        },
      });

      return res.status(400).json({ message: "Invalid election level" });
    }

    if (level === "custom" && !customLevelName) {
      // ✅ Log missing custom level name
      await SecurityLogger.log({
        event: "Election Management",
        user: req.admin.email,
        userId: req.admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Custom level name required but not provided",
        severity: "Low",
        category: "Election",
        metadata: {
          level: level,
          title: title,
        },
      });

      return res.status(400).json({ message: "customLevelName is required" });
    }

    if (level === "departmental" && !department) {
      // ✅ Log missing department for departmental election
      await SecurityLogger.log({
        event: "Election Management",
        user: req.admin.email,
        userId: req.admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details:
          "Department required for departmental election but not provided",
        severity: "Medium",
        category: "Election",
        metadata: {
          level: level,
          title: title,
        },
      });

      return res
        .status(400)
        .json({ message: "Department is required for departmental elections" });
    }

    if (level === "college" && !college) {
      // ✅ Log missing college for college election
      await SecurityLogger.log({
        event: "Election Management",
        user: req.admin.email,
        userId: req.admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "College required for college election but not provided",
        severity: "Medium",
        category: "Election",
        metadata: {
          level: level,
          title: title,
        },
      });

      return res
        .status(400)
        .json({ message: "College is required for college elections" });
    }

    if (startDate >= endDate) {
      // ✅ Log invalid date range
      await SecurityLogger.log({
        event: "Election Management",
        user: req.admin.email,
        userId: req.admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Invalid date range - end date before start date",
        severity: "Medium",
        category: "Election",
        metadata: {
          title: title,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });

      return res
        .status(400)
        .json({ message: "End date must be after start date." });
    }

    if (requireGPA && (isNaN(minGPA) || minGPA < 0 || minGPA > 4)) {
      // ✅ Log invalid GPA requirement
      await SecurityLogger.log({
        event: "Election Management",
        user: req.admin.email,
        userId: req.admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Invalid GPA requirement",
        severity: "Low",
        category: "Election",
        metadata: {
          title: title,
          invalidGPA: minGPA,
          requireGPA: requireGPA,
        },
      });

      return res
        .status(400)
        .json({ message: "minGPA must be between 0 and 4" });
    }

    // ✅ Check if election already exists for this scope
    const existingElectionQuery = {
      title,
      level,
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    };

    if (level === "departmental") {
      existingElectionQuery.department = department;
    } else if (level === "college") {
      existingElectionQuery.college = college;
    }

    const electionAlreadyExists = await Election.findOne(existingElectionQuery);

    if (electionAlreadyExists) {
      // ✅ Log duplicate election attempt
      await SecurityLogger.log({
        event: "Election Management",
        user: req.admin.email,
        userId: req.admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Attempted to create duplicate election",
        severity: "Medium",
        category: "Election",
        metadata: {
          title: title,
          level: level,
          department: department,
          college: college,
          existingElectionId: electionAlreadyExists._id,
          conflictPeriod: {
            requestedStart: startDate.toISOString(),
            requestedEnd: endDate.toISOString(),
            existingStart: electionAlreadyExists.startDate.toISOString(),
            existingEnd: electionAlreadyExists.endDate.toISOString(),
          },
        },
      });

      return res.status(400).json({
        message: `An election already exists for this ${level} level during the specified period`,
      });
    }

    // ✅ AUTO-DETERMINE ELIGIBLE VOTERS BASED ON ELECTION LEVEL
    let voterQuery = {
      isVerified: true,
      isActive: { $ne: false }, // This will include: true, null, undefined, and missing field
    };

    // Add year requirement if specified
    if (yearOfStudy) {
      // Handle both string ("Level 200") and number (2) formats
      voterQuery.$or = [
        { yearOfStudy: yearOfStudy }, // Number format
        { yearOfStudy: `Level ${yearOfStudy}00` }, // Convert number to "Level X00" format
        { yearOfStudy: `Level ${yearOfStudy * 100}` }, // Alternative format
      ].concat(voterQuery.$or || []);
    }

    // Apply level-specific filters
    switch (level) {
      case "departmental":
        voterQuery.department = department;
        break;

      case "college":
        voterQuery.college = college;
        break;

      case "university":
        // No additional filters - all verified voters can participate
        break;

      case "custom":
        // For custom elections, you might want to add specific criteria
        // This could be based on additional fields or manual selection
        if (req.body.customCriteria) {
          Object.assign(voterQuery, req.body.customCriteria);
        }
        break;
    }

    console.log("🔍 Voter eligibility query:", voterQuery);

    // ✅ FETCH ELIGIBLE VOTERS
    const eligibleVoters = await Voter.find(voterQuery).select(
      "_id firstName lastName studentId email department college yearOfStudy"
    );

    console.log(
      `📊 Found ${eligibleVoters.length} eligible voters for ${level} election`
    );

    if (eligibleVoters.length === 0) {
      console.log(
        `⚠️ No eligible voters found yet for this ${level} election. Election will be created anyway.`
      );
    }

    // ✅ AUTO-FETCH ALL POSITIONS FOR THE SELECTED LEVEL
    let electionPositions = [];

    const positionTemplate = await PositionTemplate.findOne({
      level,
      isActive: true,
    });

    if (positionTemplate) {
      // ✅ Automatically include ALL positions for this level
      electionPositions = positionTemplate.positions
        .sort((a, b) => a.order - b.order) // Sort by order
        .map((pos) => ({
          name: pos.name,
          description: pos.description,
          requirements: {
            minGPA: pos.defaultRequirements.minGPA || (requireGPA ? minGPA : 0),
            minYear: pos.defaultRequirements.minYear || 1,
            additionalRequirements:
              pos.defaultRequirements.additionalRequirements || [],
          },
          candidates: [], // Empty initially
          maxVotes: 1,
          maxCandidates: null,
        }));
    } else {
      // ✅ Fallback: Create default position if no template exists
      electionPositions = [
        {
          name:
            level === "custom"
              ? customLevelName || "Representative"
              : `${
                  level.charAt(0).toUpperCase() + level.slice(1)
                } Representative`,
          description: `Representative for ${level} level`,
          requirements: {
            minGPA: requireGPA ? minGPA : 0,
            minYear: 1,
            additionalRequirements: [],
          },
          candidates: [],
          maxVotes: 1,
          maxCandidates: null,
        },
      ];
    }

    /* Create document */
    const newElection = await Election.create({
      title,
      description,
      level,
      customLevelName: level === "custom" ? customLevelName : undefined,

      // ✅ ADD: Election scope information
      department: level === "departmental" ? department : undefined,
      college:
        level === "college" || level === "departmental" ? college : undefined,
      yearOfStudy: yearOfStudy || undefined,

      startDate,
      endDate,
      candidateRegStart,
      candidateRegEnd,
      campaignStart,
      campaignEnd,
      voteStart,
      voteEnd,
      status: "draft",
      stage: "configuration",
      isActive: false,
      candidateRequirements: {
        requireGPA,
        minGPA: requireGPA ? minGPA : undefined,
      },
      positions: electionPositions, // ✅ All positions automatically included

      createdBy: adminId,
      rules,
      features: {
        commentsEnabled: features?.commentsEnabled !== false,
        liveResultsEnabled: features?.liveResultsEnabled === true,
      },

      // ✅ ADD: Voter eligibility summary
      voterEligibility: {
        totalEligible: eligibleVoters.length,
        criteria: voterQuery,
        lastUpdated: new Date(),
      },
    });

    // ✅ Push election to blockchain
    try {
      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);

      const tx = await contract.createElection(
        title,
        startTimestamp,
        endTimestamp
      );
      const receipt = await tx.wait();

      console.log("📄 Blockchain transaction receipt:", receipt.txHash);

      // Parse event
      const event = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === "ElectionCreated");

      if (!event) throw new Error("ElectionCreated event not found");

      const blockchainElectionId = event.args.id.toString();

      // Fetch new election count from blockchain
      const electionCount = await contract.electionCount();

      console.log(
        "✅ Election pushed on-chain. Blockchain ID:",
        electionCount.toString()
      );

      // Store blockchainId in your MongoDB doc
      newElection.blockchainElectionId = electionCount.toString();
      await newElection.save();

      res.status(201).json({
        success: true,
        message: "Election created successfully",
        newElection: {
          id: newElection._id,
          blockchainId: newElection.blockchainElectionId,
          title: newElection.title,
          level: newElection.level,
        },
      });
    } catch (chainError) {
      console.error("⚠️ Blockchain sync failed:", chainError);
      res.status(500).json({ success: false, error: err.message });
    }

    // ✅ ENHANCED RESPONSE WITH VOTER STATISTICS
    const voterStats = {
      total: eligibleVoters.length,
      byCollege: {},
      byDepartment: {},
      byYear: {},
    };

    // Calculate voter distribution
    eligibleVoters.forEach((voter) => {
      // By college
      if (voter.college) {
        voterStats.byCollege[voter.college] =
          (voterStats.byCollege[voter.college] || 0) + 1;
      }

      // By department
      if (voter.department) {
        voterStats.byDepartment[voter.department] =
          (voterStats.byDepartment[voter.department] || 0) + 1;
      }

      // By year
      if (voter.yearOfStudy) {
        voterStats.byYear[voter.yearOfStudy] =
          (voterStats.byYear[voter.yearOfStudy] || 0) + 1;
      }
    });

    // ✅ SEND EMAIL NOTIFICATIONS TO ALL ELIGIBLE VOTERS
    console.log(
      `📧 Sending notifications to ${eligibleVoters.length} eligible voters...`
    );

    // Send emails asynchronously (don't wait for completion)
    sendElectionAnnouncement(eligibleVoters, newElection)
      .then((emailResults) => {
        console.log(`📊 Email notifications complete:`, emailResults);
      })
      .catch((emailError) => {
        console.error("❌ Email notification error:", emailError);
      });

    // ✅ CREATE IN-APP NOTIFICATIONS
    try {
      await createElectionNotifications(eligibleVoters, newElection);
      console.log(`🔔 In-app notifications created successfully`);
    } catch (notificationError) {
      console.error("❌ Notification creation error:", notificationError);
      // Don't fail the election creation if notifications fail
    }

    // ✅ Log successful election creation
    await SecurityLogger.log({
      event: "Election Management",
      user: req.admin.email,
      userId: req.admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Election created successfully",
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: newElection._id,
        title: title,
        level: level,
        department: department,
        college: college,
        yearOfStudy: yearOfStudy,
        eligibleVoters: eligibleVoters.length,
        positionCount: electionPositions.length,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        features: features,
        voterCriteria: voterQuery,
        notificationsQueued: eligibleVoters.length,
      },
    });

    res.status(201).json({
      message:
        "Election created successfully with auto-determined eligible voters!",
      election: {
        id: newElection._id,
        blockchainId: newElection.blockchainId || null,
        title: newElection.title,
        level: newElection.level,
        department: newElection.department,
        college: newElection.college,
        yearOfStudy: newElection.yearOfStudy,
        positionCount: electionPositions.length,
        positions: electionPositions.map((pos) => ({
          name: pos.name,
          description: pos.description,
        })),
        eligibleVoters: {
          count: eligibleVoters.length,
          criteria: voterQuery,
          statistics: voterStats,
        },
        // ✅ NEW: Notification status
        notifications: {
          emailsQueued: eligibleVoters.length,
          inAppNotificationsCreated: true,
          message: "Email notifications are being sent to all eligible voters",
        },
      },
    });
  } catch (err) {
    console.error("createElection error:", err);

    // ✅ Log election creation error
    await SecurityLogger.log({
      event: "Election Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Election creation failed with system error",
      severity: "Critical",
      category: "System",
      metadata: {
        error: err.message,
        stack: err.stack,
        title: req.body?.title,
        level: req.body?.level,
        endpoint: "/api/elections",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────────────────── Read-only queries ───────────────────────── */
exports.getAllElections = async (req, res) => {
  try {
    const admin = req.admin;

    // ✅ Log election list access
    await SecurityLogger.log({
      event: "Data Access",
      user: admin?.email || "Unknown",
      userId: admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Accessed all elections list",
      severity: "Low",
      category: "Election",
      metadata: {
        endpoint: "/api/elections",
        accessType: "list_all",
      },
    });

    const elections = await Election.find().populate(
      "candidates allowedVoters status createdBy"
    );

    if (!elections || elections.length === 0) {
      return res.status(200).json({ message: "No elections in database" });
    }

    res.status(200).json(elections);
  } catch (err) {
    console.error("getAllElections error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to retrieve elections list",
      severity: "High",
      category: "System",
      metadata: {
        error: err.message,
        endpoint: "/api/elections",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

exports.getElectionById = async (req, res) => {
  try {
    const { electionId } = req.params;
    const user = req.voter || req.admin;

    // ✅ Log election access
    await SecurityLogger.log({
      event: "Data Access",
      user: user?.email || "Unknown",
      userId: user?.id || user?._id,
      userType: req.voter ? "Voter" : "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Accessed election details",
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        endpoint: "/api/elections/:id",
        accessType: "view_details",
      },
    });

    const election = await Election.findById(req.params.electionId)
      .populate("createdBy")
      .populate("candidates", "firstName lastName photoUrl approvalStatus") // Top-level
      .populate({
        path: "positions.candidates",
        model: "Candidate",
        select:
          "firstName lastName photoUrl approvalStatus manifesto achievements experience",
      });

    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Data Access",
        user: user?.email || "Unknown",
        userId: user?.id || user?._id,
        userType: req.voter ? "Voter" : "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Attempted to access non-existent election",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          endpoint: "/api/elections/:id",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    res.json(election);
  } catch (err) {
    console.error("getElectionById error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.voter?.email || req.admin?.email || "Unknown",
      userId: req.voter?.id || req.admin?.id,
      userType: req.voter ? "Voter" : "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to retrieve election details",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        endpoint: "/api/elections/:id",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

exports.getElectionByIdForAdmins = async (req, res) => {
  try {
    const { electionId } = req.params;
    const admin = req.admin;

    // ✅ Log admin election access
    await SecurityLogger.log({
      event: "Data Access",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Admin accessed election details",
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        endpoint: "/api/admin/elections/:id",
        accessType: "admin_view",
      },
    });

    const election = await Election.findById(req.params.electionId)
      .populate("candidates allowedVoters createdBy")
      .populate({
        path: "positions.candidates",
        model: "Candidate",
        select:
          "firstName lastName photoUrl approvalStatus manifesto achievements experience", // Add fields as needed
      });

    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Data Access",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Admin attempted to access non-existent election",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          endpoint: "/api/admin/elections/:id",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    res.json(election);
  } catch (err) {
    console.error("getElectionById error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Admin failed to retrieve election details",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        endpoint: "/api/admin/elections/:id",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

// Add this new endpoint for voters to see available elections
exports.getElectionsForVoter = async (req, res) => {
  try {
    const voterId = req.voter.id; // From voter auth middleware
    const voter = req.voter;

    // ✅ Log voter election access
    await SecurityLogger.log({
      event: "Data Access",
      user: voter.email,
      userId: voter._id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Voter accessed available elections",
      severity: "Low",
      category: "Election",
      metadata: {
        voterId: voterId,
        endpoint: "/api/elections/voter",
        accessType: "voter_elections",
      },
    });

    // Get voter details to check department/college
    const voterDetails = await Voter.findById(voterId);
    if (!voterDetails) {
      // ✅ Log voter not found
      await SecurityLogger.log({
        event: "Data Access",
        user: voter.email,
        userId: voter._id,
        userType: "Voter",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Voter not found in database",
        severity: "High",
        category: "Security",
        metadata: {
          voterId: voterId,
          endpoint: "/api/elections/voter",
        },
      });

      return res.status(404).json({ message: "Voter not found" });
    }

    // Build query based on voter's eligibility
    let query = {
      isActive: true,
      stage: { $in: ["active", "voting"] }, // Only show active elections
      $or: [
        { level: "university" }, // All voters can see university elections
        { level: "college", allowedVoters: voterId }, // College elections if voter is allowed
        {
          level: "departmental",
          $or: [
            { allowedVoters: voterId }, // Specifically allowed
            {
              // Or department matches and no specific voters set
              allowedVoters: { $size: 0 },
              // Add department matching logic here if needed
            },
          ],
        },
      ],
    };

    const elections = await Election.find(query)
      .populate(
        "positions.candidates",
        "firstName lastName photoUrl approvalStatus"
      )
      .populate("createdBy", "firstName lastName")
      .sort({ startDate: 1 });

    // Filter elections by department for departmental level
    const filteredElections = elections.filter((election) => {
      if (election.level === "departmental") {
        // Check if voter's department matches or if voter is specifically allowed
        return (
          election.allowedVoters.includes(voterId) ||
          // Add department matching logic if you store department info in election
          true
        ); // Placeholder - implement department matching
      }
      return true;
    });

    // Format response with additional info for voters
    const formattedElections = filteredElections.map((election) => ({
      id: election._id,
      title: election.title,
      description: election.description,
      level: election.level,
      startDate: election.startDate,
      endDate: election.endDate,
      stage: election.stage,
      status: election.status,
      voteStart: election.voteStart,
      voteEnd: election.voteEnd,
      positions: election.positions.map((position) => ({
        id: position._id,
        name: position.name,
        description: position.description,
        candidateCount: position.candidates.filter(
          (c) => c.approvalStatus === "approved"
        ).length,
        candidates: position.candidates
          .filter((c) => c.approvalStatus === "approved")
          .map((candidate) => ({
            id: candidate._id,
            name: `${candidate.firstName} ${candidate.lastName}`,
            photoUrl: candidate.photoUrl,
          })),
      })),
      canVote:
        election.stage === "voting" &&
        election.voteStart <= new Date() &&
        election.voteEnd >= new Date(),
      canViewCandidates: election.stage !== "draft",
      hasApplied: false, // Will be updated below
    }));

    // Check if voter has applied as candidate for any election
    const candidateApplications = await Candidate.find({
      email: voter.email,
      electionId: { $in: formattedElections.map((e) => e.id) },
    });

    formattedElections.forEach((election) => {
      const application = candidateApplications.find(
        (app) => app.electionId.toString() === election.id.toString()
      );
      election.hasApplied = !!application;
      election.applicationStatus = application?.approvalStatus || null;
    });

    res.json({
      message: "Elections retrieved successfully",
      elections: formattedElections,
      voterInfo: {
        id: voterDetails._id,
        name: `${voterDetails.firstName} ${voterDetails.lastName}`,
        department: voterDetails.department,
        college: voterDetails.college,
        canApplyAsCandidate: voterDetails.isVerified,
      },
    });
  } catch (error) {
    console.error("getElectionsForVoter error:", error);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.voter?.email || "Unknown",
      userId: req.voter?._id,
      userType: "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to retrieve voter elections",
      severity: "High",
      category: "System",
      metadata: {
        error: error.message,
        endpoint: "/api/elections/voter",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────────────────── Lifecycle controls ───────────────────────── */
exports.startVoting = async (req, res) => {
  try {
    const { electionId } = req.params;
    const admin = req.admin;

    const election = await Election.findById(electionId);
    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Attempted to start voting for non-existent election",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          action: "start_voting",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    const previousStatus = election.status;
    election.status = "active";
    election.isActive = true;
    election.voteStart = election.voteStart || new Date();
    await election.save();

    // ✅ Log voting started
    await SecurityLogger.log({
      event: "Election Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Voting started for election",
      severity: "Medium",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        action: "start_voting",
        previousStatus: previousStatus,
        newStatus: election.status,
        voteStart: election.voteStart.toISOString(),
      },
    });

    res.json({ message: "Voting started", election });
  } catch (err) {
    console.error("startVoting error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Election Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to start voting",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        action: "start_voting",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

exports.pauseVoting = async (req, res) => {
  try {
    const { electionId } = req.params;
    const admin = req.admin;

    const election = await Election.findById(electionId);
    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Attempted to pause voting for non-existent election",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          action: "pause_voting",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    const previousStatus = election.status;
    election.status = "paused";
    election.isActive = false;
    await election.save();

    // ✅ Log voting paused
    await SecurityLogger.log({
      event: "Election Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Voting paused for election",
      severity: "High",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        action: "pause_voting",
        previousStatus: previousStatus,
        newStatus: election.status,
        pausedAt: new Date().toISOString(),
      },
    });

    res.json({ message: "Voting paused", election });
  } catch (err) {
    console.error("pauseVoting error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Election Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to pause voting",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        action: "pause_voting",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

exports.endVoting = async (req, res) => {
  try {
    const { electionId } = req.params;
    const admin = req.admin;

    const election = await Election.findById(electionId);
    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Attempted to end voting for non-existent election",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          action: "end_voting",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    const previousStatus = election.status;
    election.status = "ended";
    election.isActive = false;
    election.voteEnd = election.voteEnd || new Date();
    await election.save();

    // ✅ Log voting ended
    await SecurityLogger.log({
      event: "Election Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Voting ended for election",
      severity: "High",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        action: "end_voting",
        previousStatus: previousStatus,
        newStatus: election.status,
        voteEnd: election.voteEnd.toISOString(),
      },
    });

    res.json({ message: "Voting ended", election });
  } catch (err) {
    console.error("endVoting error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Election Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to end voting",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        action: "end_voting",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────────────────── Candidate reg toggle & GPA ───────────────────────── */
exports.toggleCandidateRegistration = async (req, res) => {
  try {
    const { electionId } = req.params;
    const admin = req.admin;

    const election = await Election.findById(electionId);
    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details:
          "Attempted to toggle candidate registration for non-existent election",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          action: "toggle_candidate_registration",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    const now = new Date();
    const open = election.isCandidateRegOpen;
    const previousRegStart = election.candidateRegStart;
    const previousRegEnd = election.candidateRegEnd;

    if (open) {
      election.candidateRegEnd = now;
    } else {
      election.candidateRegStart = now;
      election.candidateRegEnd = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000
      );
    }
    await election.save();

    // ✅ Log candidate registration toggle
    await SecurityLogger.log({
      event: "Election Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: `Candidate registration ${open ? "closed" : "opened"}`,
      severity: "Medium",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        action: "toggle_candidate_registration",
        previousState: open ? "open" : "closed",
        newState: open ? "closed" : "open",
        previousRegStart: previousRegStart,
        previousRegEnd: previousRegEnd,
        newRegStart: election.candidateRegStart,
        newRegEnd: election.candidateRegEnd,
      },
    });

    res.json({ message: "Candidate registration window toggled", election });
  } catch (err) {
    console.error("toggleCandidateRegistration error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Election Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to toggle candidate registration",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        action: "toggle_candidate_registration",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

exports.setCandidateRequirements = async (req, res) => {
  try {
    const { electionId } = req.params;
    const { requireGPA, minGPA } = req.body;
    const admin = req.admin;

    const election = await Election.findById(electionId);
    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details:
          "Attempted to set candidate requirements for non-existent election",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          action: "set_candidate_requirements",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    if (requireGPA && (isNaN(minGPA) || minGPA < 0 || minGPA > 4)) {
      // ✅ Log invalid GPA requirement
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Invalid GPA requirement provided",
        severity: "Low",
        category: "Election",
        metadata: {
          electionId: electionId,
          invalidGPA: minGPA,
          requireGPA: requireGPA,
        },
      });

      return res.status(400).json({ message: "minGPA must be 0–4" });
    }

    const previousRequirements = {
      requireGPA: election.candidateRequirements.requireGPA,
      minGPA: election.candidateRequirements.minGPA,
    };

    election.candidateRequirements.requireGPA = requireGPA === true;
    election.candidateRequirements.minGPA = requireGPA
      ? Number(minGPA)
      : undefined;
    await election.save();

    // ✅ Log candidate requirements update
    await SecurityLogger.log({
      event: "Election Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Candidate requirements updated",
      severity: "Medium",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        action: "set_candidate_requirements",
        previousRequirements: previousRequirements,
        newRequirements: {
          requireGPA: election.candidateRequirements.requireGPA,
          minGPA: election.candidateRequirements.minGPA,
        },
      },
    });

    res.json({ message: "Candidate requirements updated", election });
  } catch (err) {
    console.error("setCandidateRequirements error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Election Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to set candidate requirements",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        action: "set_candidate_requirements",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────────────────── Results & analytics ───────────────────────── */
exports.getLiveResultsChain = async (req, res) => {
  try {
    const { electionId } = req.params;
    const user = req.admin || req.voter;

    // ✅ Log results access
    await SecurityLogger.log({
      event: "Data Access",
      user: user?.email || "Unknown",
      userId: user?.id || user?._id,
      userType: req.admin ? "Admin" : "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Accessed live election results from blockchain",
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        endpoint: "/api/elections/:id/results",
        dataSource: "blockchain",
      },
    });

    const election = await Election.findById(electionId).populate("candidates");
    if (!election) {
      return res.status(404).json({ message: "Election not found" });
    }

    const chainElectionId = BigInt(election._id.toString().slice(-12), 16);
    const results = [];

    for (const cand of election.candidates) {
      const chainCandId = BigInt(cand._id.toString().slice(-12), 16);
      const count = await contractRO.getVotes(chainElectionId, chainCandId);
      results.push({
        candidateId: cand._id,
        candidateName: `${cand.firstName} ${cand.lastName}`,
        votes: Number(count),
      });
    }
    results.sort((a, b) => b.votes - a.votes);
    res.json(results);
  } catch (err) {
    console.error("getLiveResultsChain error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.admin?.email || req.voter?.email || "Unknown",
      userId: req.admin?.id || req.voter?._id,
      userType: req.admin ? "Admin" : "Voter",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to retrieve live results from blockchain",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        dataSource: "blockchain",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

exports.exportResultsCSV = async (req, res) => {
  try {
    const { electionId } = req.params;
    const admin = req.admin;

    // ✅ Log results export
    await SecurityLogger.log({
      event: "Data Export",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Exported election results as CSV",
      severity: "Medium",
      category: "Election",
      metadata: {
        electionId: electionId,
        exportFormat: "CSV",
        exportType: "results",
      },
    });

    const results = await Election.getLiveResults(electionId);
    exportCSV(res, results, "election-results.csv");
  } catch (err) {
    console.error("exportResultsCSV error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Export",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to export election results",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        exportFormat: "CSV",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

exports.votesAnalytics = async (req, res) => {
  try {
    const { from, to } = req.query;
    const electionId = req.params.electionId;
    const admin = req.admin;

    // ✅ Log analytics access
    await SecurityLogger.log({
      event: "Data Access",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Accessed votes analytics data",
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        dateRange: { from, to },
        endpoint: "/api/elections/:id/analytics",
      },
    });

    const data = await Election.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(electionId) } },
      { $unwind: "$votes" },
      {
        $match: {
          "votes.createdAt": {
            $gte: new Date(from),
            $lte: new Date(to),
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$votes.createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ data });
  } catch (err) {
    console.error("votesAnalytics error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to retrieve votes analytics",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        dateRange: { from: req.query?.from, to: req.query?.to },
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────────────────── Publish / delete / update-config ───────────────────────── */
exports.publishResults = async (req, res) => {
  try {
    const { electionId } = req.params;
    const admin = req.admin;

    const election = await Election.findById(electionId);
    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Attempted to publish results for non-existent election",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          action: "publish_results",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    if (election.status !== "ended") {
      // ✅ Log invalid publish attempt
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Attempted to publish results before voting ended",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          electionTitle: election.title,
          currentStatus: election.status,
          action: "publish_results",
        },
      });

      return res.status(400).json({
        message: "Results can only be published once voting has ended",
      });
    }

    election.resultsPublished = true;
    await election.save();

    // ✅ Log results published
    await SecurityLogger.log({
      event: "Election Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Election results published",
      severity: "High",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        action: "publish_results",
        publishedAt: new Date().toISOString(),
      },
    });

    res.json({ message: "Election results published successfully.", election });
  } catch (err) {
    console.error("publishResults error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Election Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to publish election results",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        action: "publish_results",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

exports.updateElectionConfig = async (req, res) => {
  try {
    const { electionId } = req.params;
    const rules = sanitizeString(req.body.rules || "");
    const stage = sanitizeString(req.body.stage || "");
    const features = req.body.features || {};
    const admin = req.admin;

    const election = await Election.findById(electionId);
    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Attempted to update config for non-existent election",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          action: "update_config",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    const previousConfig = {
      rules: election.rules,
      stage: election.stage,
      features: election.features,
    };

    if (rules) election.rules = rules;
    if (stage) election.stage = stage;
    if (features) election.features = features;

    await election.save();

    // ✅ Log config update
    await SecurityLogger.log({
      event: "Election Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Election configuration updated",
      severity: "Medium",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        action: "update_config",
        previousConfig: previousConfig,
        newConfig: {
          rules: election.rules,
          stage: election.stage,
          features: election.features,
        },
      },
    });

    res.json({
      message: "Election configuration updated successfully",
      election,
    });
  } catch (err) {
    console.error("updateElectionConfig error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Election Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to update election configuration",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        action: "update_config",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};
/* ───────────────────────── Raw vote export ───────────────────────── */
/**
 * GET /api/elections/:electionId/votes[.?format=csv|json]
 * Default = csv.  Admin or super-admin only.
 */
exports.exportVotesRaw = async (req, res) => {
  try {
    const { electionId } = req.params;
    const format = (req.query.format || "csv").toLowerCase();
    const admin = req.admin;

    // ✅ Log raw vote export attempt
    await SecurityLogger.log({
      event: "Data Export",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Exported raw votes data",
      severity: "High",
      category: "Election",
      metadata: {
        electionId: electionId,
        exportFormat: format,
        exportType: "raw_votes",
        endpoint: "/api/elections/:id/votes",
        securityNote: "Raw votes contain sensitive voter information",
      },
    });

    const election = await Election.findById(electionId)
      .populate("candidates", "firstName lastName")
      .populate("allowedVoters", "studentId email");

    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Data Export",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Attempted to export raw votes for non-existent election",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          exportFormat: format,
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    /* Build flat array */
    const rows = election.votes.map((v) => {
      const cand = election.candidates.find((c) => c._id.equals(v.candidateId));
      const voter =
        election.allowedVoters.find((vt) => vt._id.equals(v.voterId)) || {};
      return {
        electionId,
        candidateId: v.candidateId,
        candidateName: cand ? `${cand.firstName} ${cand.lastName}` : "—",
        voterId: v.voterId || "anon",
        voterStudentId: voter.studentId || "",
        voterEmail: voter.email || "",
        txHash: v.txHash,
        createdAt: v.createdAt.toISOString(),
      };
    });

    // ✅ Log successful export with record count
    await SecurityLogger.log({
      event: "Data Export",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Raw votes export completed",
      severity: "High",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        exportFormat: format,
        exportType: "raw_votes",
        recordCount: rows.length,
        voterDataExposed: true,
      },
    });

    /* Send */
    if (format === "json") {
      return res.json(rows); // application/json
    }
    // CSV
    exportCSV(res, rows, "votes-raw.csv"); // util already sets headers
  } catch (err) {
    console.error("exportVotesRaw error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Export",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to export raw votes",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        exportFormat: req.query?.format || "csv",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteElection = async (req, res) => {
  try {
    const { electionId } = req.params;
    const admin = req.admin;

    // Find election first to log its details
    const election = await Election.findById(electionId);
    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Election Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Attempted to delete non-existent election",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          action: "delete_election",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    // Store election details before deletion
    const electionDetails = {
      title: election.title,
      level: election.level,
      status: election.status,
      startDate: election.startDate,
      endDate: election.endDate,
      voterCount: election.allowedVoters?.length || 0,
      candidateCount: election.candidates?.length || 0,
      voteCount: election.votes?.length || 0,
    };

    // ✅ Log election deletion attempt (before deletion)
    await SecurityLogger.log({
      event: "Election Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Election deleted permanently",
      severity: "Critical",
      category: "Election",
      metadata: {
        electionId: electionId,
        action: "delete_election",
        deletedElection: electionDetails,
        deletedAt: new Date().toISOString(),
        warningNote: "This action is irreversible",
      },
    });

    // Delete the election
    await Election.findByIdAndDelete(electionId);

    res.json({ message: "Election deleted successfully." });
  } catch (err) {
    console.error("deleteElection error:", err);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Election Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to delete election",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: err.message,
        action: "delete_election",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

/* ═══════════════════════════════════════════════════════════════════════════════
   📋 CANDIDATE REGISTRATION - GET AVAILABLE ELECTIONS & POSITIONS
═══════════════════════════════════════════════════════════════════════════════ */

// Get elections available for candidate registration
exports.getAvailableElections = async (req, res) => {
  try {
    console.log("🔍 getAvailableElections called");
    const currentDate = new Date();
    console.log("🔍 Current date:", currentDate.toISOString());

    // ✅ Log available elections access (public endpoint)
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Accessed available elections for candidate registration",
      severity: "Low",
      category: "Election",
      metadata: {
        endpoint: "/api/elections/available",
        accessType: "public_candidate_registration",
        currentDate: currentDate.toISOString(),
      },
    });

    // Find elections that are accepting candidate registrations
    const query = {
      status: {
        $in: ["candidate_registration"],
      },
      candidateRegStart: { $lte: currentDate },
      candidateRegEnd: { $gte: currentDate },
    };

    console.log("🔍 Query:", JSON.stringify(query, null, 2));

    const availableElections = await Election.find(query).select(
      "title description level department college yearOfStudy positions candidateRegStart candidateRegEnd candidateRequirements"
    );

    console.log("🔍 Found elections:", availableElections.length);
    console.log(
      "🔍 Elections data:",
      JSON.stringify(availableElections, null, 2)
    );

    if (availableElections.length === 0) {
      console.log("📭 No elections found, returning 404");

      // ✅ Log no elections available
      await SecurityLogger.log({
        event: "Data Access",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Success",
        details: "No available elections for candidate registration",
        severity: "Low",
        category: "Election",
        metadata: {
          endpoint: "/api/elections/available",
          queryUsed: query,
          resultCount: 0,
        },
      });

      return res.status(404).json({
        message: "No elections are currently accepting candidate registrations",
        currentDate: currentDate.toISOString(),
        debug: {
          note: "Make sure election status is 'candidate_registration' and dates are correct",
        },
      });
    }

    console.log("🔄 Formatting elections data...");

    // Format election data with available positions
    const formattedElections = availableElections.map((election) => {
      console.log("🔄 Processing election:", election.title);

      return {
        id: election._id,
        title: election.title,
        description: election.description,
        level: election.level,
        department: election.department,
        college: election.college,
        yearOfStudy: election.yearOfStudy,
        candidateRegistrationPeriod: {
          start: election.candidateRegStart,
          end: election.candidateRegEnd,
          daysRemaining: Math.ceil(
            (election.candidateRegEnd - currentDate) / (1000 * 60 * 60 * 24)
          ),
        },
        positions:
          election.positions?.map((pos) => ({
            id: pos._id,
            name: pos.name,
            description: pos.description,
            maxCandidates: pos.maxCandidates,
            requirements: pos.requirements,
          })) || [],
        requirements: election.candidateRequirements,
        eligibilityCriteria: {
          level: election.level,
          department: election.department,
          college: election.college,
          yearOfStudy: election.yearOfStudy,
          requireGPA: election.candidateRequirements?.requireGPA,
          minGPA: election.candidateRequirements?.minGPA,
        },
      };
    });

    console.log("✅ Successfully formatted elections, sending response");

    // ✅ Log successful response
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Successfully retrieved available elections",
      severity: "Low",
      category: "Election",
      metadata: {
        endpoint: "/api/elections/available",
        electionsReturned: formattedElections.length,
        electionTitles: formattedElections.map((e) => e.title),
      },
    });

    res.json({
      message: "Available elections for candidate registration",
      elections: formattedElections,
      totalElections: formattedElections.length,
    });
  } catch (error) {
    console.error("❌ getAvailableElections error:", error);
    console.error("❌ Error stack:", error.stack);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to retrieve available elections",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/elections/available",
        error: error.message,
        stack: error.stack,
      },
    });

    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get positions for a specific election
exports.getElectionPositions = async (req, res) => {
  try {
    const { electionId } = req.params;
    console.log("🔍 getElectionPositions called for:", electionId);

    // ✅ Log election positions access
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Accessed election positions for candidate registration",
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        endpoint: "/api/elections/:id/positions",
        accessType: "public_position_view",
      },
    });

    const election = await Election.findById(electionId).select(
      "title positions level candidateRequirements"
    );

    if (!election) {
      console.log("❌ Election not found");

      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Data Access",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Attempted to access positions for non-existent election",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          endpoint: "/api/elections/:id/positions",
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    console.log("✅ Election found:", election.title);

    // Fetch all candidates for this election, grouped by positionId
    let candidatesByPosition = {};
    try {
      const candidates = await Candidate.find({
        electionId: new mongoose.Types.ObjectId(electionId),
        approvalStatus: { $in: ["pending", "approved"] },
      })
        .populate({
          path: "promises", // ✅ ADD THIS
          select: "title details createdAt",
          options: { sort: { createdAt: -1 } },
        })
        .populate("electionId", "title status")
        .select(
          "firstName lastName photoUrl promises approvalStatus manifesto achievements experience positionId"
        );

      candidates.forEach((candidate) => {
        const posId = candidate.positionId.toString();
        if (!candidatesByPosition[posId]) candidatesByPosition[posId] = [];
        candidatesByPosition[posId].push(candidate);
      });
    } catch (candidateError) {
      console.log(
        "⚠️ Candidate fetching skipped - model may not exist:",
        candidateError.message
      );
    }

    // Format positions with full candidate objects
    const formattedPositions = election.positions.map((position) => {
      const currentCandidates =
        candidatesByPosition[position._id.toString()] || [];
      const isAvailable =
        !position.maxCandidates ||
        currentCandidates.length < position.maxCandidates;

      return {
        id: position._id,
        name: position.name,
        description: position.description,
        requirements: position.requirements,
        maxCandidates: position.maxCandidates,

        // ✅ Enhanced candidate formatting with promises
        currentCandidates: currentCandidates.map((candidate) => ({
          id: candidate._id,
          name: `${candidate.firstName} ${candidate.lastName}`,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          photoUrl: candidate.photoUrl,
          approvalStatus: candidate.approvalStatus,

          // ✅ Format promises for frontend display
          promises: {
            items: candidate.promises || [],
            count: candidate.promises ? candidate.promises.length : 0,
            preview:
              candidate.promises && candidate.promises.length > 0
                ? candidate.promises[0].title
                : "No campaign promises yet",
            hasPromises: candidate.promises && candidate.promises.length > 0,
          },

          // Additional candidate info
          manifesto: candidate.manifesto,
          achievements: candidate.achievements || [],
          experience: candidate.experience || [],
          positionId: candidate.positionId,
        })),

        isAvailable,
        maxVotes: position.maxVotes,
        candidateCount: currentCandidates.length,
      };
    });

    console.log("✅ Formatted positions:", formattedPositions.length);

    // ✅ Log successful position retrieval
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Successfully retrieved election positions",
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        positionCount: formattedPositions.length,
        availablePositions: formattedPositions.filter((pos) => pos.isAvailable)
          .length,
        endpoint: "/api/elections/:id/positions",
      },
    });

    res.json({
      message: "Election positions retrieved successfully",
      election: {
        id: election._id,
        title: election.title,
        level: election.level,
        requirements: election.candidateRequirements,
      },
      positions: formattedPositions,
      totalPositions: formattedPositions.length,
      availablePositions: formattedPositions.filter((pos) => pos.isAvailable)
        .length,
    });
  } catch (error) {
    console.error("❌ getElectionPositions error:", error);
    console.error("❌ Error stack:", error.stack);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to retrieve election positions",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: error.message,
        stack: error.stack,
        endpoint: "/api/elections/:id/positions",
      },
    });

    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Check candidate eligibility for specific election
exports.checkCandidateEligibility = async (req, res) => {
  try {
    const { electionId } = req.params;
    const { studentId, department, college, yearOfStudy, gpa } = req.body;

    // ✅ Log eligibility check attempt
    await SecurityLogger.log({
      event: "Eligibility Check",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Candidate eligibility check performed",
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        studentId: studentId ? "provided" : "missing",
        endpoint: "/api/elections/:id/eligibility",
        checkType: "candidate_eligibility",
      },
    });

    if (!studentId) {
      // ✅ Log missing student ID
      await SecurityLogger.log({
        event: "Eligibility Check",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Eligibility check failed - missing student ID",
        severity: "Low",
        category: "Election",
        metadata: {
          electionId: electionId,
          reason: "missing_student_id",
        },
      });

      return res.status(400).json({
        message: "Student ID is required to check eligibility",
      });
    }

    const election = await Election.findById(electionId);
    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Eligibility Check",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Eligibility check failed - election not found",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          studentId: studentId,
        },
      });

      return res.status(404).json({ message: "Election not found" });
    }

    // Check if candidate registration is open
    const currentDate = new Date();
    if (
      currentDate < election.candidateRegStart ||
      currentDate > election.candidateRegEnd
    ) {
      // ✅ Log registration closed
      await SecurityLogger.log({
        event: "Eligibility Check",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Eligibility check failed - registration period closed",
        severity: "Low",
        category: "Election",
        metadata: {
          electionId: electionId,
          electionTitle: election.title,
          studentId: studentId,
          registrationPeriod: {
            start: election.candidateRegStart,
            end: election.candidateRegEnd,
            current: currentDate,
          },
        },
      });

      return res.status(400).json({
        message:
          "Candidate registration is not currently open for this election",
        registrationPeriod: {
          start: election.candidateRegStart,
          end: election.candidateRegEnd,
          current: currentDate,
        },
      });
    }

    // Check eligibility criteria
    let isEligible = true;
    let eligibilityChecks = [];
    let errors = [];

    // Level-specific checks
    switch (election.level) {
      case "departmental":
        const deptCheck = department === election.department;
        eligibilityChecks.push({
          criterion: "Department",
          required: election.department,
          provided: department,
          passed: deptCheck,
        });
        if (!deptCheck) {
          isEligible = false;
          errors.push(`Must be from ${election.department} department`);
        }
        break;

      case "college":
        const collegeCheck = college === election.college;
        eligibilityChecks.push({
          criterion: "College",
          required: election.college,
          provided: college,
          passed: collegeCheck,
        });
        if (!collegeCheck) {
          isEligible = false;
          errors.push(`Must be from ${election.college}`);
        }
        break;

      case "university":
        eligibilityChecks.push({
          criterion: "Level",
          required: "University-wide",
          provided: "All students eligible",
          passed: true,
        });
        break;
    }

    // Year check
    if (election.yearOfStudy) {
      const yearCheck = parseInt(yearOfStudy) === election.yearOfStudy;
      eligibilityChecks.push({
        criterion: "Year of Study",
        required: election.yearOfStudy,
        provided: yearOfStudy,
        passed: yearCheck,
      });
      if (!yearCheck) {
        isEligible = false;
        errors.push(`Must be in year ${election.yearOfStudy}`);
      }
    }

    // GPA check
    if (election.candidateRequirements?.requireGPA) {
      const gpaValue = parseFloat(gpa);
      const gpaCheck = gpaValue >= election.candidateRequirements.minGPA;
      eligibilityChecks.push({
        criterion: "Minimum GPA",
        required: election.candidateRequirements.minGPA,
        provided: gpaValue,
        passed: gpaCheck,
      });
      if (!gpaCheck) {
        isEligible = false;
        errors.push(
          `Minimum GPA of ${election.candidateRequirements.minGPA} required`
        );
      }
    }

    // Check if already applied
    const existingApplication = await Candidate.findOne({
      electionId,
      studentId,
    });

    if (existingApplication) {
      isEligible = false;
      errors.push("Already applied for this election");
    }

    // ✅ Log eligibility check result
    await SecurityLogger.log({
      event: "Eligibility Check",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: `Eligibility check completed - ${
        isEligible ? "eligible" : "not eligible"
      }`,
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        studentId: studentId,
        eligible: isEligible,
        failedChecks: errors,
        eligibilityChecks: eligibilityChecks,
        hasExistingApplication: !!existingApplication,
      },
    });

    res.json({
      eligible: isEligible,
      election: {
        id: election._id,
        title: election.title,
        level: election.level,
      },
      eligibilityChecks,
      errors: errors.length > 0 ? errors : undefined,
      existingApplication: existingApplication
        ? {
            position: existingApplication.position,
            approvalStatus: existingApplication.approvalStatus,
            applicationStage: existingApplication.applicationStage,
          }
        : null,
    });
  } catch (error) {
    console.error("checkCandidateEligibility error:", error);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Eligibility Check",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Eligibility check failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: error.message,
        stack: error.stack,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

// ✅ **Get All Active Elections for Dropdown Selection**
exports.getActiveElections = async (req, res) => {
  try {
    const { includeAll = false } = req.query;

    // ✅ Log active elections access
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Accessed active elections list",
      severity: "Low",
      category: "Election",
      metadata: {
        endpoint: "/api/elections/active",
        includeAll: includeAll,
        accessType: "public_active_elections",
      },
    });

    // ✅ Build filter - include all or just active/upcoming elections
    const filter =
      includeAll === "true"
        ? {}
        : {
            status: {
              $in: [
                "candidate_registration",
                "campaign",
                "voting",
                "completed",
              ],
            },
          };

    const elections = await Election.find(filter)
      .select(
        "title level status description startDate endDate candidates voteStart voteEnd candidateRegStart candidateRegEnd positions"
      )
      .sort({ startDate: 1 })
      .lean();

    // ✅ Format for dropdown
    const formattedElections = elections.map((election) => ({
      id: election._id,
      title: election.title,
      level: election.level,
      status: election.status,
      description: election.description || "No description available",
      startDate: election.startDate,
      endDate: election.endDate,
      votingStart: election.voteStart,
      votingEnd: election.voteEnd,
      positionCount: election.positions?.length || 0,
      candidateCount: election.candidates?.length || 0,
      registrationOpen:
        new Date() >= new Date(election.candidateRegStart) &&
        new Date() <= new Date(election.candidateRegEnd),
    }));

    // ✅ Log successful retrieval
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Successfully retrieved active elections",
      severity: "Low",
      category: "Election",
      metadata: {
        endpoint: "/api/elections/active",
        electionsReturned: formattedElections.length,
        includeAll: includeAll,
        filterApplied: filter,
      },
    });

    res.json({
      message: "Elections retrieved successfully",
      elections: formattedElections,
      totalElections: formattedElections.length,
      activeElections: formattedElections.filter(
        (e) => e.status === "voting" || e.status === "campaign"
      ).length,
      completedElections: formattedElections.filter(
        (e) => e.status === "completed"
      ).length,
      upcomingElections: formattedElections.filter(
        (e) => e.status === "candidate_registration"
      ).length,
    });
  } catch (error) {
    console.error("Error fetching active elections:", error);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to retrieve active elections",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/elections/active",
        error: error.message,
        includeAll: req.query?.includeAll,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

// ✅ **Get Active Elections for Candidate Registration** (PUBLIC)
exports.getActiveElectionsForRegistration = async (req, res) => {
  try {
    const now = new Date();

    // ✅ Log access to elections for registration
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Accessed elections for candidate registration",
      severity: "Low",
      category: "Election",
      metadata: {
        endpoint: "/api/elections/registration",
        accessType: "public_registration_elections",
        currentDate: now.toISOString(),
      },
    });

    // Get elections where candidate registration is open
    const elections = await Election.find({
      status: { $in: ["candidate_registration", "campaign", "voting"] },
      candidateRegStart: { $lte: now },
      candidateRegEnd: { $gte: now },
    })
      .select(
        "title level status startDate endDate candidateRegStart candidateRegEnd positions"
      )
      .sort({ candidateRegStart: 1 })
      .lean();

    // Format for frontend dropdown
    const formattedElections = elections.map((election) => ({
      id: election._id,
      title: election.title,
      level: election.level,
      status: election.status,
      startDate: election.startDate,
      endDate: election.endDate,
      candidateRegStart: election.candidateRegStart,
      candidateRegEnd: election.candidateRegEnd,
      positionCount: election.positions?.length || 0,
      registrationOpen: true, // All returned elections have open registration
    }));

    // ✅ Log successful retrieval
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Successfully retrieved elections for registration",
      severity: "Low",
      category: "Election",
      metadata: {
        endpoint: "/api/elections/registration",
        electionsReturned: formattedElections.length,
        electionTitles: formattedElections.map((e) => e.title),
      },
    });

    res.json({
      message: "Available elections for candidate registration",
      elections: formattedElections,
      totalElections: formattedElections.length,
    });
  } catch (error) {
    console.error("Error fetching elections for registration:", error);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to retrieve elections for registration",
      severity: "High",
      category: "System",
      metadata: {
        endpoint: "/api/elections/registration",
        error: error.message,
        stack: error.stack,
      },
    });

    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ✅ **Get Available Positions for Selected Election** (PUBLIC)
exports.getElectionPositionsForRegistration = async (req, res) => {
  try {
    const { electionId } = req.params;

    // ✅ Log position access for registration
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Accessed election positions for registration",
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        endpoint: "/api/elections/:id/positions/registration",
        accessType: "public_position_registration",
      },
    });

    // Validate electionId
    if (!mongoose.Types.ObjectId.isValid(electionId)) {
      // ✅ Log invalid election ID
      await SecurityLogger.log({
        event: "Data Access",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Invalid election ID format provided",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          endpoint: "/api/elections/:id/positions/registration",
          invalidFormat: true,
        },
      });

      return res.status(400).json({
        message: "Invalid election ID format",
        received: electionId,
      });
    }

    // Get election with positions
    const election = await Election.findById(electionId)
      .select("title positions level status candidateRegStart candidateRegEnd")
      .lean();

    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Data Access",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election not found for position registration",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          endpoint: "/api/elections/:id/positions/registration",
        },
      });

      return res.status(404).json({
        message: "Election not found",
        electionId,
      });
    }

    // Check if candidate registration is still open
    const now = new Date();
    const start = new Date(election.candidateRegStart);
    const end = new Date(election.candidateRegEnd);

    console.log({
      now: now.toISOString(),
      start: election.candidateRegStart,
      end: election.candidateRegEnd,
    });

    if (isNaN(start) || isNaN(end)) {
      // ✅ Log invalid registration dates
      await SecurityLogger.log({
        event: "Data Access",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Election has invalid registration dates",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          electionTitle: election.title,
          invalidDates: {
            start: election.candidateRegStart,
            end: election.candidateRegEnd,
          },
        },
      });

      return res.status(400).json({
        message: "Election registration dates are not set correctly",
        registrationPeriod: {
          start: election.candidateRegStart,
          end: election.candidateRegEnd,
        },
      });
    }

    const registrationOpen = now >= start && now <= end;

    if (!registrationOpen) {
      // ✅ Log registration closed
      await SecurityLogger.log({
        event: "Data Access",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Candidate registration is closed for this election",
        severity: "Low",
        category: "Election",
        metadata: {
          electionId: electionId,
          electionTitle: election.title,
          registrationPeriod: {
            start: election.candidateRegStart,
            end: election.candidateRegEnd,
            now: now,
          },
        },
      });

      return res.status(400).json({
        message: "Candidate registration is closed for this election",
        registrationPeriod: {
          start: election.candidateRegStart,
          end: election.candidateRegEnd,
          now: now,
        },
      });
    }

    // Get candidate counts for each position (optional stats)
    let positionStats = {};
    try {
      const candidateCounts = await Candidate.aggregate([
        {
          $match: {
            electionId: new mongoose.Types.ObjectId(electionId),
          },
        },
        {
          $group: {
            _id: {
              positionId: "$positionId",
              status: "$approvalStatus",
            },
            count: { $sum: 1 },
          },
        },
      ]);

      // Organize stats by position
      candidateCounts.forEach((item) => {
        const positionId = item._id.positionId?.toString();
        if (positionId) {
          if (!positionStats[positionId]) {
            positionStats[positionId] = {
              total: 0,
              approved: 0,
              pending: 0,
              rejected: 0,
            };
          }
          positionStats[positionId][item._id.status] = item.count;
          positionStats[positionId].total += item.count;
        }
      });
    } catch (statsError) {
      console.warn("Could not fetch candidate stats:", statsError.message);
    }

    // Format positions with availability info
    const formattedPositions = election.positions.map((position) => {
      const stats = positionStats[position._id.toString()] || {
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
      };

      return {
        id: position._id,
        name: position.name,
        description: position.description,
        requirements: position.requirements || [],
        maxCandidates: position.maxCandidates || null,
        maxVotes: position.maxVotes || 1,
        candidates: stats,
        isAvailable:
          !position.maxCandidates || stats.total < position.maxCandidates,
      };
    });

    // ✅ Log successful position retrieval
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Successfully retrieved election positions for registration",
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        positionCount: formattedPositions.length,
        availablePositions: formattedPositions.filter((pos) => pos.isAvailable)
          .length,
        registrationOpen: registrationOpen,
      },
    });

    res.json({
      message: "Election positions retrieved successfully",
      election: {
        id: election._id,
        title: election.title,
        level: election.level,
        status: election.status,
        registrationOpen,
        candidateRegStart: election.candidateRegStart,
        candidateRegEnd: election.candidateRegEnd,
      },
      positions: formattedPositions,
      totalPositions: formattedPositions.length,
      availablePositions: formattedPositions.filter((pos) => pos.isAvailable)
        .length,
    });
  } catch (error) {
    console.error("Error fetching election positions:", error);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Data Access",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Failed to retrieve election positions for registration",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.params?.electionId,
        error: error.message,
        stack: error.stack,
        endpoint: "/api/elections/:id/positions/registration",
      },
    });

    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ✅ **Check Candidate Eligibility** (PUBLIC) - Updated version
exports.checkCandidateEligibility = async (req, res) => {
  try {
    const { electionId, studentId, department, college, yearOfStudy, gpa } =
      req.query;

    // ✅ Log eligibility check via query params
    await SecurityLogger.log({
      event: "Eligibility Check",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Candidate eligibility check via query parameters",
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        studentId: studentId ? "provided" : "missing",
        endpoint: "/api/elections/eligibility",
        checkType: "query_param_eligibility",
      },
    });

    // Basic validation
    if (!electionId || !studentId) {
      // ✅ Log missing parameters
      await SecurityLogger.log({
        event: "Eligibility Check",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Eligibility check failed - missing required parameters",
        severity: "Low",
        category: "Election",
        metadata: {
          electionId: electionId || "missing",
          studentId: studentId ? "provided" : "missing",
          missingParams: {
            electionId: !electionId,
            studentId: !studentId,
          },
        },
      });

      return res.status(400).json({
        message: "Election ID and Student ID are required",
        eligible: false,
      });
    }

    // Check if candidate already registered for this election
    const existingCandidate = await Candidate.findOne({
      electionId,
      studentId,
    });

    if (existingCandidate) {
      // ✅ Log duplicate registration attempt
      await SecurityLogger.log({
        event: "Eligibility Check",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Eligibility check failed - already registered",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          studentId: studentId,
          existingApplicationStatus: existingCandidate.approvalStatus,
          existingApplicationDate: existingCandidate.createdAt,
        },
      });

      return res.status(400).json({
        message: "You have already registered for this election",
        eligible: false,
        errors: ["Already registered for this election"],
        existingApplication: {
          status: existingCandidate.approvalStatus,
          submittedAt: existingCandidate.createdAt,
        },
      });
    }

    // Get election details for eligibility requirements
    const election = await Election.findById(electionId);
    if (!election) {
      // ✅ Log election not found
      await SecurityLogger.log({
        event: "Eligibility Check",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Eligibility check failed - election not found",
        severity: "Medium",
        category: "Election",
        metadata: {
          electionId: electionId,
          studentId: studentId,
        },
      });

      return res.status(404).json({
        message: "Election not found",
        eligible: false,
      });
    }

    // Check registration period
    const now = new Date();
    const registrationOpen =
      now >= new Date(election.candidateRegStart) &&
      now <= new Date(election.candidateRegEnd);

    if (!registrationOpen) {
      // ✅ Log registration period closed
      await SecurityLogger.log({
        event: "Eligibility Check",
        user: "Public/Anonymous",
        userId: null,
        userType: "Public",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Eligibility check failed - registration period closed",
        severity: "Low",
        category: "Election",
        metadata: {
          electionId: electionId,
          electionTitle: election.title,
          studentId: studentId,
          registrationPeriod: {
            start: election.candidateRegStart,
            end: election.candidateRegEnd,
            current: now,
          },
        },
      });

      return res.status(400).json({
        message: "Candidate registration is closed",
        eligible: false,
        errors: ["Registration period has ended"],
      });
    }

    // Basic eligibility checks
    const errors = [];
    let eligible = true;

    // GPA requirement (example: minimum 2.5)
    if (gpa && parseFloat(gpa) < 2.5) {
      errors.push("Minimum GPA of 2.5 required");
      eligible = false;
    }

    // Year of study requirements (example: must be at least year 2)
    if (yearOfStudy && parseInt(yearOfStudy) < 2) {
      errors.push("Must be at least in year 2 to run for office");
      eligible = false;
    }

    // Additional eligibility checks can be added here based on your requirements

    // ✅ Log eligibility check result
    await SecurityLogger.log({
      event: "Eligibility Check",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: `Eligibility check completed - ${
        eligible ? "eligible" : "not eligible"
      }`,
      severity: "Low",
      category: "Election",
      metadata: {
        electionId: electionId,
        electionTitle: election.title,
        studentId: studentId,
        eligible: eligible,
        failedChecks: errors,
        providedData: {
          department: department || "not provided",
          college: college || "not provided",
          yearOfStudy: yearOfStudy || "not provided",
          gpa: gpa || "not provided",
        },
      },
    });

    res.json({
      message: eligible ? "Eligible to register" : "Not eligible",
      eligible,
      errors: errors.length > 0 ? errors : undefined,
      election: {
        title: election.title,
        registrationEnd: election.candidateRegEnd,
      },
    });
  } catch (error) {
    console.error("Error checking candidate eligibility:", error);

    // ✅ Log error
    await SecurityLogger.log({
      event: "Eligibility Check",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Eligibility check failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        electionId: req.query?.electionId,
        studentId: req.query?.studentId ? "provided" : "missing",
        error: error.message,
        stack: error.stack,
      },
    });

    res.status(500).json({
      message: "Server error",
      eligible: false,
    });
  }
};

async function getEligibleVoterCount(election) {
  let query = { isVerified: true, isActive: { $ne: false } };
  switch (election.level) {
    case "departmental":
      query.department = election.department;
      break;
    case "college":
      query.college = election.college;
      break;
    case "university":
      // No extra filter
      break;
  }
  if (election.yearOfStudy) {
    query.yearOfStudy = election.yearOfStudy;
  }
  if (election.candidateRequirements?.requireGPA) {
    query.gpa = { $gte: election.candidateRequirements.minGPA };
  }
  return await Voter.countDocuments(query);
}

exports.getElectionTurnout = async (req, res) => {
  try {
    const { electionId } = req.params;
    const election = await Election.findById(electionId);
    if (!election)
      return res.status(404).json({ message: "Election not found" });

    if (election.status !== "voting") {
      return res.status(400).json({
        message: "Election is not currently in voting status",
        status: election.status,
      });
    }

    // Get eligible count
    const totalEligible = await getEligibleVoterCount(election);

    // Get voted count (unique voters)
    const votedVoterIds = new Set(
      election.votes.map((v) => v.voterId.toString())
    );
    const totalVoted = votedVoterIds.size;

    res.json({
      electionId,
      title: election.title,
      totalEligible,
      totalVoted,
      turnoutPercent:
        totalEligible > 0
          ? ((totalVoted / totalEligible) * 100).toFixed(2)
          : "0.00",
      totalDidNotVote: totalEligible - totalVoted,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
