const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const validator = require("validator");

const Candidate = require("../models/candidate.model");
const Election = require("../models/election.model");
const Voter = require("../models/voter.model");
const Event = require("../models/event.model");
const CampaignPromise = require("../models/promise.model");
const ForumQuestion = require("../models/forumQuestion.model");

const { buildFileUrl } = require("../utils/fileUpload");
const { sendEmail } = require("../utils/emailService");

const cloudinary = require("../config/cloudinary");

const SecurityLogger = require("../services/securityLogger");

const { sanitizeString, sanitizeEmail } = require("../utils/sanitizeInput");
const { debug } = require("console");

const cleanupFiles = (files) => {
  if (!files) return;

  const allFiles = Object.values(files).flat();

  allFiles.forEach((file) => {
    if (file && file.path && !file.path.startsWith("http")) {
      fs.unlink(file.path, (err) => {
        if (err) {
          console.error(`❌ Failed to delete file ${file.path}:`, err.message);
        } else {
          console.log(`✅ Successfully deleted file: ${file.filename}`);
        }
      });
    }
  });

  console.log(`🧹 Cleaned up ${allFiles.length} uploaded files`);
};

const uploadToCloudinary = async (file, folder) => {
  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder,
      resource_type: "auto", // supports images, PDFs, docs, etc.
    });
    return result.secure_url;
  } catch (err) {
    console.error(`❌ Cloudinary upload failed for ${file.originalname}:`, err);
    throw err;
  }
};

/* ───────────────────────── Register a new candidate ───────────────────────── */
exports.registerCandidate = async (req, res) => {
  try {
    // ------------------------
    // Initial logging & checks
    // ------------------------
    await SecurityLogger.log({
      event: "Candidate Registration",
      user: "Public/Anonymous",
      userId: null,
      userType: "Public",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Candidate registration attempt initiated",
      severity: "Medium",
      category: "Candidate",
      metadata: {
        endpoint: "/api/candidates/register",
        hasFiles: !!req.files,
        formDataReceived: !!req.body && Object.keys(req.body).length > 0,
        contentType: req.get("Content-Type"),
      },
    });

    if (!req.body || Object.keys(req.body).length === 0) {
      cleanupFiles(req.files);
      return res.status(400).json({ message: "No form data received" });
    }

    // ------------------------
    // Extract & sanitize form data
    // ------------------------
    const electionId = sanitizeString(req.body.electionId);
    const positionId = sanitizeString(req.body.positionId);
    const campaignSlogan = sanitizeString(req.body.campaignSlogan || "");

    const rawEmail = Array.isArray(req.body.email)
      ? req.body.email[0]
      : req.body.email;
    const email = sanitizeEmail(rawEmail);

    if (!email || !validator.isEmail(email))
      return res.status(400).json({ message: "Invalid email format" });
    if (!/^[a-zA-Z0-9._]+@st\.ug\.edu\.gh$/.test(email.toLowerCase()))
      return res
        .status(400)
        .json({ message: "Email must be UG student address" });

    const rawStudentId = Array.isArray(req.body.studentId)
      ? req.body.studentId[0]
      : req.body.studentId;
    const studentId = sanitizeString(rawStudentId);

    // ------------------------
    // Fetch verified voter
    // ------------------------
    const existingUser = await Voter.findOne({
      $or: [{ email }, { studentId }],
      isVerified: true,
    });
    if (!existingUser) {
      cleanupFiles(req.files);
      return res.status(403).json({
        message: "You must be a verified voter to apply as a candidate",
      });
    }

    // ------------------------
    // Strict voter data comparison
    // ------------------------
    const mismatchedFields = [];
    if (req.body.firstName && req.body.firstName !== existingUser.firstName)
      mismatchedFields.push("firstName");
    if (req.body.lastName && req.body.lastName !== existingUser.lastName)
      mismatchedFields.push("lastName");
    if (email.toLowerCase() !== existingUser.email.toLowerCase())
      mismatchedFields.push("email");
    if (studentId !== existingUser.studentId)
      mismatchedFields.push("studentId");
    if (
      req.body.mobileNumber &&
      req.body.mobileNumber !== existingUser.mobileNumber
    )
      mismatchedFields.push("mobileNumber");
    if (req.body.college && req.body.college !== existingUser.college)
      mismatchedFields.push("college");
    if (req.body.department && req.body.department !== existingUser.department)
      mismatchedFields.push("department");
    if (
      req.body.yearOfStudy &&
      req.body.yearOfStudy !== existingUser.yearOfStudy
    )
      mismatchedFields.push("yearOfStudy");

    console.log(req.body.firstName, existingUser.firstName);
    console.log(req.body.lastName, existingUser.lastName);
    console.log(req.body.email.toLowerCase(), existingUser.email.toLowerCase());
    console.log(req.body.studentId, existingUser.studentId);
    console.log(req.body.mobileNumber, existingUser.mobileNumber);
    console.log(req.body.college, existingUser.college);
    console.log(req.body.department, existingUser.department);
    console.log(req.body.yearOfStudy, existingUser.yearOfStudy);
    console.log("Mismatched fields:", mismatchedFields);
    if (mismatchedFields.length > 0) {
      cleanupFiles(req.files);
      return res.status(400).json({
        message: "Registration data does not match verified voter record",
        mismatchedFields,
      });
    }

    // ------------------------
    // Election & eligibility validation
    // ------------------------
    const election = await Election.findById(electionId);
    if (!election) {
      cleanupFiles(req.files);
      return res
        .status(404)
        .json({ message: "Election not found", electionId });
    }

    if (existingUser.isBlacklisted)
      return res
        .status(403)
        .json({ message: "You are not eligible to register as a candidate" });
    if (
      election.level === "departmental" &&
      existingUser.department !== election.department
    )
      return res.status(403).json({
        message: `This election is for ${election.department} department only`,
      });
    if (
      election.level === "college" &&
      existingUser.college !== election.college
    )
      return res.status(403).json({
        message: `This election is for ${election.college} college only`,
      });

    const position = election.positions.find(
      (p) => p._id.toString() === positionId
    );
    if (!position)
      return res
        .status(400)
        .json({ message: "Invalid position for this election" });

    // ------------------------
    // Document validation
    // ------------------------
    if (
      !req.files ||
      !req.files.photo ||
      !req.files.transcript ||
      !req.files.manifesto
    ) {
      cleanupFiles(req.files);
      return res.status(400).json({ message: "Required documents missing" });
    }
    // Upload required documents
    const photoUrl = await uploadToCloudinary(
      req.files.photo[0],
      "candidates/photo"
    );
    const transcriptUrl = await uploadToCloudinary(
      req.files.transcript[0],
      "candidates/transcript"
    );
    const manifestoUrl = await uploadToCloudinary(
      req.files.manifesto[0],
      "candidates/manifesto"
    );

    // Upload optional additional documents
    const additionalDocs = [];
    if (req.files.additionalDocs) {
      for (const file of req.files.additionalDocs) {
        const url = await uploadToCloudinary(file, "candidates/additionalDocs");
        additionalDocs.push({
          name: file.originalname,
          url,
          uploadedAt: new Date(),
        });
      }
    }

    // ------------------------
    // Duplicate candidate checks
    // ------------------------
    const existingCandidate = await Candidate.findOne({
      $and: [{ electionId }, { $or: [{ studentId }, { email }] }],
    });
    if (existingCandidate) {
      cleanupFiles(req.files);
      return res
        .status(400)
        .json({ message: "Candidate already exists in this election" });
    }

    const existingInPosition = await Candidate.findOne({
      studentId,
      electionId,
      positionId,
    });
    if (existingInPosition) {
      cleanupFiles(req.files);
      return res.status(400).json({
        message: "Already registered for this position in this election",
      });
    }

    // ------------------------
    // Create candidate
    // ------------------------
    const newCandidate = await Candidate.create({
      firstName: existingUser.firstName,
      lastName: existingUser.lastName,
      studentId: existingUser.studentId,
      email: existingUser.email.toLowerCase(),
      mobileNumber: existingUser.mobileNumber,
      yearOfStudy: existingUser.yearOfStudy,
      college: existingUser.college,
      department: existingUser.department,
      gpa: existingUser.gpa,
      electionId,
      positionId,
      position: position.name,
      campaignSlogan,
      photoUrl,
      transcriptUrl,
      manifestoUrl,
      additionalDocuments: additionalDocs,
      documentsUploaded: {
        photo: !!photoUrl,
        transcript: !!transcriptUrl,
        manifesto: !!manifestoUrl,
      },
      approvalStatus: "pending",
      approvalStatusMessage: "Your application is under review.",
      applicationStage: "review_pending",
      applicationSubmittedAt: new Date(),
      registrationIP: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Add candidate to election
    await Election.updateOne(
      { _id: electionId, "positions._id": positionId },
      {
        $addToSet: {
          candidates: newCandidate._id,
          "positions.$.candidates": newCandidate._id,
        },
      }
    );

    // 🔹 4. Send confirmation email (skip in dev)
    if (process.env.NODE_ENV === "production") {
      await sendEmail(
        newCandidate.email,
        "Candidate Registration Received - SmartVote",
        `Dear ${newCandidate.firstName}, your candidacy application for ${position.name} has been received and is under review.`
      );
    } else {
      console.log("📧 [DEV] Skipping email send");
    }

    // ------------------------
    // Success response
    // ------------------------
    res.status(201).json({
      message: "Candidate registered successfully",
      candidate: {
        id: newCandidate._id,
        name: `${newCandidate.firstName} ${newCandidate.lastName}`,
        email: newCandidate.email,
        studentId: newCandidate.studentId,
        election: { id: electionId, positionId, positionName: position.name },
      },
    });
  } catch (error) {
    console.error("Error registering candidate:", error);
    if (
      error.message &&
      (error.message.includes("network") ||
        error.message.includes("timeout") ||
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ETIMEDOUT"))
    ) {
      return res.status(503).json({
        message:
          "Network error during file upload. Please check your connection and try again.",
      });
    }

    await SecurityLogger.log({
      event: "Candidate Registration",
      user: req.body?.email || "Unknown",
      status: "Critical",
      details: "Candidate registration failed with system error",
      severity: "High",
      category: "System",
      metadata: { error: error.message, stack: error.stack },
    });

    if (req.files) cleanupFiles(req.files);
    res.status(500).json({
      message: "Server error during candidate registration",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/* ───────────────────────── Approval workflow ───────────────────────── */
exports.approveCandidate = async (req, res) => {
  try {
    const candidateId = req.params.id;
    const admin = req.admin;

    // ✅ Log approval attempt
    await SecurityLogger.log({
      event: "Candidate Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Candidate approval process initiated",
      severity: "High",
      category: "Candidate",
      metadata: {
        candidateId: candidateId,
        action: "approve_candidate",
        endpoint: "/api/candidates/:id/approve",
      },
    });

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      // ✅ Log candidate not found
      await SecurityLogger.log({
        event: "Candidate Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Candidate approval failed - candidate not found",
        severity: "Medium",
        category: "Candidate",
        metadata: {
          candidateId: candidateId,
          action: "approve_candidate",
          error: "candidate_not_found",
        },
      });

      return res.status(404).json({ message: "Candidate not found." });
    }

    if (candidate.approvalStatus === "approved") {
      // ✅ Log already approved
      await SecurityLogger.log({
        event: "Candidate Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Candidate approval failed - already approved",
        severity: "Low",
        category: "Candidate",
        metadata: {
          candidateId: candidateId,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          currentStatus: candidate.approvalStatus,
          action: "approve_candidate",
          error: "already_approved",
        },
      });

      return res
        .status(400)
        .json({ message: "Candidate is already approved." });
    }

    // Store previous status for logging
    const previousStatus = candidate.approvalStatus;

    // ✅ Update candidate status
    candidate.approvalStatus = "approved";
    candidate.approvalStatusMessage =
      "Congratulations! Your candidacy has been approved.";
    candidate.approvedBy = admin._id;
    candidate.approvedAt = new Date();
    candidate.rejectionReason = null;
    candidate.rejectedBy = null;
    await candidate.save();

    // ✅ NOW grant candidate role to the voter
    await Voter.updateOne(
      { email: candidate.email.toLowerCase() },
      { $set: { role: "candidate" } }
    );

    // ✅ Add candidate to election position
    await Election.updateOne(
      {
        _id: candidate.electionId,
        "positions._id": candidate.positionId,
      },
      {
        $addToSet: { "positions.$.candidates": candidate._id },
      }
    );
    await Election.updateOne(
      {
        _id: candidate.electionId,
      },
      {
        $addToSet: { candidates: candidate._id },
      }
    );

    // ✅ Log successful approval
    await SecurityLogger.log({
      event: "Candidate Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Candidate approved successfully",
      severity: "High",
      category: "Candidate",
      metadata: {
        candidateId: candidateId,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        candidateStudentId: candidate.studentId,
        position: candidate.position,
        electionId: candidate.electionId,
        previousStatus: previousStatus,
        newStatus: "approved",
        approvedBy: admin.email,
        approvedAt: candidate.approvedAt,
        voterRoleGranted: true,
        addedToElection: true,
        action: "approve_candidate",
      },
    });

    // ✅ Send approval email with login instructions
    try {
      await sendEmail(
        candidate.email,
        "Candidacy Approved - SmartVote",
        `Congratulations ${candidate.firstName}! Your candidacy for ${candidate.position} has been approved.`,
        `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">🎉 Candidacy Approved!</h2>
          <p>Dear ${candidate.firstName} ${candidate.lastName},</p>
          
          <p><strong>Congratulations!</strong> Your candidacy application has been approved.</p>
          
          <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <h3 style="margin: 0 0 10px 0; color: #065f46;">Application Approved</h3>
            <p><strong>Position:</strong> ${candidate.position}</p>
            <p><strong>Status:</strong> Approved</p>
            <p><strong>Approved by:</strong> Admin</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          
          <div style="background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #1e40af;">Next Steps:</h3>
            <ol>
              <li><strong>Login to your candidate dashboard</strong></li>
              <li>Update your campaign information</li>
              <li>Upload additional materials if needed</li>
              <li>Start campaigning (if campaign period has begun)</li>
            </ol>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/candidate/login" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Access Candidate Dashboard
            </a>
          </div>
          
          <p>Good luck with your campaign!</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">
            This is an automated message from SmartVote Election System.
          </p>
        </div>
        `
      );

      // ✅ Log approval email sent
      await SecurityLogger.log({
        event: "Email Notification",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Success",
        details: "Candidate approval email sent successfully",
        severity: "Low",
        category: "Notification",
        metadata: {
          candidateId: candidateId,
          candidateEmail: candidate.email,
          emailType: "candidate_approval",
          approvedBy: admin.email,
        },
      });

      console.log(`✅ Approval email sent to ${candidate.email}`);
    } catch (emailError) {
      console.error("Failed to send approval email:", emailError);

      // ✅ Log email failure
      await SecurityLogger.log({
        event: "Email Notification",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Failed to send candidate approval email",
        severity: "Medium",
        category: "Notification",
        metadata: {
          candidateId: candidateId,
          candidateEmail: candidate.email,
          emailType: "candidate_approval",
          error: emailError.message,
          approvedBy: admin.email,
        },
      });
    }

    res.status(200).json({
      message: "Candidate approved successfully",
      candidate: {
        id: candidate._id,
        name: `${candidate.firstName} ${candidate.lastName}`,
        position: candidate.position,
        approvalStatus: candidate.approvalStatus,
        approvedAt: candidate.approvedAt,
      },
    });
  } catch (error) {
    console.error("Error approving candidate:", error);

    // ✅ Log critical error
    await SecurityLogger.log({
      event: "Candidate Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Candidate approval failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        candidateId: req.params?.id,
        action: "approve_candidate",
        error: error.message,
        stack: error.stack,
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

exports.rejectCandidate = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const candidateId = req.params.id;
    const admin = req.admin;

    // ✅ Log rejection attempt
    await SecurityLogger.log({
      event: "Candidate Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Candidate rejection process initiated",
      severity: "High",
      category: "Candidate",
      metadata: {
        candidateId: candidateId,
        action: "reject_candidate",
        hasRejectionReason: !!rejectionReason?.trim(),
        endpoint: "/api/candidates/:id/reject",
      },
    });

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      // ✅ Log candidate not found
      await SecurityLogger.log({
        event: "Candidate Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Candidate rejection failed - candidate not found",
        severity: "Medium",
        category: "Candidate",
        metadata: {
          candidateId: candidateId,
          action: "reject_candidate",
          error: "candidate_not_found",
        },
      });

      return res.status(404).json({ message: "Candidate not found." });
    }

    if (!rejectionReason?.trim()) {
      // ✅ Log missing rejection reason
      await SecurityLogger.log({
        event: "Candidate Management",
        user: admin.email,
        userId: admin.id,
        userType: "Admin",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Candidate rejection failed - no rejection reason provided",
        severity: "Medium",
        category: "Candidate",
        metadata: {
          candidateId: candidateId,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          action: "reject_candidate",
          error: "missing_rejection_reason",
        },
      });

      return res.status(400).json({ message: "Rejection reason is required." });
    }

    // Store previous status for logging
    const previousStatus = candidate.approvalStatus;

    candidate.approvalStatus = "rejected";
    candidate.approvalStatusMessage = "Your candidacy was rejected.";
    candidate.rejectionReason = rejectionReason;
    candidate.rejectedBy = admin._id;
    candidate.approvedBy = null;
    await candidate.save();

    // Remove candidate from position's candidates array in Election
    await Election.updateOne(
      { _id: candidate.electionId, "positions._id": candidate.positionId },
      {
        $pull: { "positions.$.candidates": candidate._id },
      }
    );

    // Optionally, remove from election-level candidates array if you use it
    await Election.updateOne(
      { _id: candidate.electionId },
      { $pull: { candidates: candidate._id } }
    );

    // ✅ Log successful rejection (before deletion)
    await SecurityLogger.log({
      event: "Candidate Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Candidate rejected and will be deleted",
      severity: "High",
      category: "Candidate",
      metadata: {
        candidateId: candidateId,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        candidateStudentId: candidate.studentId,
        position: candidate.position,
        electionId: candidate.electionId,
        previousStatus: previousStatus,
        rejectionReason: rejectionReason,
        rejectedBy: admin.email,
        rejectedAt: new Date().toISOString(),
        removedFromElection: true,
        willBeDeleted: true,
        action: "reject_candidate",
      },
    });

    // Delete candidate after rejection
    await Candidate.deleteOne({ _id: candidate._id });

    // ✅ Log candidate deletion
    await SecurityLogger.log({
      event: "Candidate Management",
      user: admin.email,
      userId: admin.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Rejected candidate deleted from system",
      severity: "Critical",
      category: "Candidate",
      metadata: {
        deletedCandidateId: candidateId,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        rejectionReason: rejectionReason,
        deletedBy: admin.email,
        deletedAt: new Date().toISOString(),
        action: "delete_rejected_candidate",
        warningNote: "Candidate data permanently removed",
      },
    });

    console.log(`Candidate ${candidate._id} deleted after rejection.`);

    res.status(200).json({ message: "Candidate rejected successfully." });
  } catch (error) {
    console.error("Error rejecting candidate:", error);

    // ✅ Log critical error
    await SecurityLogger.log({
      event: "Candidate Management",
      user: req.admin?.email || "Unknown",
      userId: req.admin?.id,
      userType: "Admin",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Critical",
      details: "Candidate rejection failed with system error",
      severity: "High",
      category: "System",
      metadata: {
        candidateId: req.params?.id,
        action: "reject_candidate",
        error: error.message,
        stack: error.stack,
        rejectionReason: req.body?.rejectionReason || "not provided",
      },
    });

    res.status(500).json({ message: "Server error" });
  }
};

exports.logoutCandidate = (req, res) => {
  try {
    res.clearCookie("candidateToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    res.json({ message: "Logout successful" });
  } catch (err) {
    console.error("Logout candidate error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────────────────── Self-check & Admin-check ───────────────────────── */
exports.getCandidateStatus = async (req, res) => {
  try {
    const { studentId, email } = req.body;
    const candidate = await Candidate.findOne({ studentId, email });
    if (!candidate)
      return res.status(404).json({ message: "Candidate not found." });

    res.status(200).json({
      approvalStatus: candidate.approvalStatus,
      approvalStatusMessage: candidate.approvalStatusMessage,
      rejectionReason: candidate.rejectionReason || null,
    });
  } catch (error) {
    console.error("Error fetching candidate status:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.adminGetCandidateStatus = async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate)
      return res.status(404).json({ message: "Candidate not found." });

    res.status(200).json({
      fullName: `${candidate.firstName} ${candidate.lastName}`,
      position: candidate.position,
      studentId: candidate.studentId,
      email: candidate.email,
      approvalStatus: candidate.approvalStatus,
      approvalStatusMessage: candidate.approvalStatusMessage,
      rejectionReason: candidate.rejectionReason || null,
      approvedBy: candidate.approvedBy,
      rejectedBy: candidate.rejectedBy,
    });
  } catch (error) {
    console.error("Error fetching candidate status by admin:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────────────────── File uploads ───────────────────────── */

exports.uploadDocuments = async (req, res) => {
  try {
    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate)
      return res.status(404).json({ message: "Candidate not found." });

    const updated = {};

    ["photo", "transcript", "manifesto"].forEach((field) => {
      if (req.files?.[field]) {
        const storedPath = req.files[field][0].path; // disk path
        updated[`${field}Url`] = buildFileUrl(req, storedPath);
      }
    });

    Object.assign(candidate, updated);
    await candidate.save();

    res
      .status(200)
      .json({ message: "Files uploaded successfully", urls: updated });
  } catch (error) {
    console.error("Error uploading documents:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────────────────── Campaign Events ───────────────────────── */
exports.createEvent = async (req, res) => {
  try {
    const { title, dateTime, venue, electionId } = req.body;

    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    const event = await Event.create({
      title: sanitizeString(title),
      dateTime: new Date(dateTime),
      venue: sanitizeString(venue),
      candidate: candidate._id, // ✅ Use candidate._id instead of req.candidate.id
      election: sanitizeString(electionId),
    });
    res.status(201).json(event);
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.listEvents = async (req, res) => {
  try {
    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    const events = await Event.find({ candidate: candidate._id });
    res.json(events);
  } catch (error) {
    console.error("Error listing events:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { title, dateTime, venue } = req.body;

    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }
    const event = await Event.findOneAndUpdate(
      { _id: req.params.eventId, candidate: candidate._id },
      {
        ...(title && { title: sanitizeString(title) }),
        ...(dateTime && { dateTime: new Date(dateTime) }),
        ...(venue && { venue: sanitizeString(venue) }),
      },
      { new: true }
    );
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.json(event);
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    const deleted = await Event.findOneAndDelete({
      _id: req.params.eventId,
      candidate: candidate._id, // ✅ Use candidate._id
    });
    if (!deleted) return res.status(404).json({ message: "Event not found" });
    res.json({ message: "Event deleted" });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────────────────── Campaign Promises ───────────────────────── */
exports.addPromise = async (req, res) => {
  try {
    const { title, details, electionId } = req.body;

    if (!title || !details || !electionId) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // ✅ Authentication checks (your existing code)
    if (!req.voter) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const voterId = req.voter.id || req.voter._id;
    if (!voterId) {
      return res.status(401).json({
        message: "Invalid voter authentication",
        debug: {
          voterExists: !!req.voter,
          voterKeys: req.voter ? Object.keys(req.voter) : [],
        },
      });
    }

    const voter = await Voter.findById(voterId);
    if (!voter) {
      return res.status(404).json({ message: "Voter not found" });
    }

    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    // ✅ Log promise creation attempt
    await SecurityLogger.log({
      event: "Campaign Management",
      user: voter.email,
      userId: voterId,
      userType: "Candidate",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "In Progress",
      details: "Campaign promise creation initiated",
      severity: "Medium",
      category: "Campaign",
      metadata: {
        candidateId: candidate._id,
        electionId: electionId,
        promiseTitle: title,
        endpoint: "/api/candidates/promises",
      },
    });

    // ✅ Create the promise
    const promise = await CampaignPromise.create({
      title: sanitizeString(title),
      details: sanitizeString(details),
      candidate: candidate._id,
      election: sanitizeString(electionId),
    });

    // ✅ ADD THIS: Update the candidate to include this promise
    await Candidate.findByIdAndUpdate(
      candidate._id,
      { $push: { promises: promise._id } },
      { new: true }
    );

    console.log(
      `✅ Promise ${promise._id} added to candidate ${candidate._id}`
    );

    // ✅ Log successful promise creation
    await SecurityLogger.log({
      event: "Campaign Management",
      user: voter.email,
      userId: voterId,
      userType: "Candidate",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Campaign promise created and linked to candidate",
      severity: "Medium",
      category: "Campaign",
      metadata: {
        candidateId: candidate._id,
        promiseId: promise._id,
        electionId: electionId,
        promiseTitle: title,
        promiseLength: details.length,
        linkedToCandidate: true, // ✅ Indicate successful linking
      },
    });

    res.status(201).json({
      message: "Campaign promise added successfully",
      promise: {
        id: promise._id,
        title: promise.title,
        details: promise.details,
        candidate: promise.candidate,
        election: promise.election,
        createdAt: promise.createdAt,
      },
    });
  } catch (error) {
    console.error("Error adding promise:", error);

    // ✅ Enhanced error logging
    try {
      await SecurityLogger.log({
        event: "Campaign Management",
        user: req.voter?.email || "Unknown",
        userId: req.voter?.id || req.voter?._id || null,
        userType: "Candidate",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Campaign promise creation failed with system error",
        severity: "High",
        category: "System",
        metadata: {
          endpoint: "/api/candidates/promises",
          error: error.message,
          stack: error.stack,
          hasVoter: !!req.voter,
          voterKeys: req.voter ? Object.keys(req.voter) : [],
          failurePoint: "promise_creation_or_linking",
        },
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

exports.listPromises = async (req, res) => {
  try {
    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    const promises = await CampaignPromise.find({
      candidate: candidate._id, // ✅ Use candidate._id instead of req.candidate.id
    });
    res.json(promises);
  } catch (error) {
    console.error("Error listing promises:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updatePromise = async (req, res) => {
  try {
    const { title, details } = req.body;

    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    const promise = await CampaignPromise.findOneAndUpdate(
      { _id: req.params.promiseId, candidate: candidate._id }, // ✅ Use candidate._id
      {
        ...(title && { title: sanitizeString(title) }),
        ...(details && { details: sanitizeString(details) }),
      },
      { new: true }
    );
    if (!promise) return res.status(404).json({ message: "Promise not found" });
    res.json(promise);
  } catch (error) {
    console.error("Error updating promise:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deletePromise = async (req, res) => {
  try {
    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    // ✅ Delete the promise
    const deleted = await CampaignPromise.findOneAndDelete({
      _id: req.params.promiseId,
      candidate: candidate._id,
    });

    if (!deleted) {
      return res.status(404).json({ message: "Promise not found" });
    }

    // ✅ ADD THIS: Remove promise from candidate's promises array
    await Candidate.findByIdAndUpdate(
      candidate._id,
      { $pull: { promises: req.params.promiseId } },
      { new: true }
    );

    console.log(
      `✅ Promise ${req.params.promiseId} removed from candidate ${candidate._id}`
    );

    res.json({
      message: "Promise deleted successfully",
      deletedPromise: {
        id: deleted._id,
        title: deleted.title,
      },
    });
  } catch (error) {
    console.error("Error deleting promise:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.commentOnPromise = async (req, res) => {
  try {
    const { text } = req.body;
    const promise = await CampaignPromise.findById(req.params.promiseId);
    if (!promise) return res.status(404).json({ message: "Promise not found" });

    // ✅ This one stays as req.voter.id since it's a voter commenting
    const voter = await Voter.findById(req.voter.id);
    if (!voter) {
      return res.status(403).json({ message: "Voter authentication required" });
    }

    promise.comments.push({
      voter: voter._id, // ✅ Use voter._id
      text: sanitizeString(text),
    });
    await promise.save();

    res
      .status(201)
      .json({ message: "Comment added", comments: promise.comments });
  } catch (error) {
    console.error("Error commenting on promise:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────────────────── Forum Q&A ───────────────────────── */
exports.askQuestion = async (req, res) => {
  try {
    const { question, electionId } = req.body;

    // ✅ This stays as voter since voters ask questions
    const voter = await Voter.findById(req.voter.id);
    if (!voter) {
      return res.status(403).json({ message: "Voter authentication required" });
    }

    const q = await ForumQuestion.create({
      question: sanitizeString(question),
      voter: voter._id, // ✅ Use voter._id
      candidate: req.params.candidateId,
      election: sanitizeString(electionId),
    });
    res.status(201).json(q);
  } catch (error) {
    console.error("Error asking question:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.answerQuestion = async (req, res) => {
  try {
    const { answer } = req.body;

    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    const q = await ForumQuestion.findOneAndUpdate(
      { _id: req.params.questionId, candidate: candidate._id }, // ✅ Use candidate._id
      { answer: sanitizeString(answer), status: "answered" },
      { new: true }
    );
    if (!q) return res.status(404).json({ message: "Question not found" });
    res.json(q);
  } catch (error) {
    console.error("Error answering question:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.listQuestions = async (req, res) => {
  try {
    const questions = await ForumQuestion.find({
      candidate: req.params.candidateId,
    });
    res.json(questions);
  } catch (error) {
    console.error("Error listing questions:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ───────────────────────── Social links ───────────────────────── */
exports.updateSocialLinks = async (req, res) => {
  try {
    const { facebook, twitter, instagram, linkedin } = req.body;

    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    candidate.socialLinks = {
      facebook: sanitizeString(facebook || ""),
      twitter: sanitizeString(twitter || ""),
      instagram: sanitizeString(instagram || ""),
      linkedin: sanitizeString(linkedin || ""),
    };
    await candidate.save();

    res.json({
      message: "Social links updated",
      socialLinks: candidate.socialLinks,
    });
  } catch (error) {
    console.error("Error updating social links:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// **Get All Candidates** (Admin only)
exports.getAllCandidates = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      search,
      sortBy = "createdAt",
      order = "desc",
      electionId, // ✅ NEW: Filter by election
      positionId, // ✅ NEW: Filter by position within election
      fromDate, // Filter applications from this date
      toDate, // Filter applications to this date
      daysAgo,
    } = req.query;

    // ✅ **Build query filters with election support**
    let query = {};

    // ✅ **Most important: Filter by election**
    if (electionId) {
      query.electionId = sanitizeString(electionId);
    }

    // ✅ **Filter by position within election**
    if (positionId) {
      query.positionId = sanitizeString(positionId);
    }

    // ✅ **DATE FILTERING**
    if (fromDate || toDate || daysAgo) {
      query.applicationSubmittedAt = {};

      if (fromDate) {
        query.applicationSubmittedAt.$gte = new Date(fromDate);
      }

      if (toDate) {
        query.applicationSubmittedAt.$lte = new Date(toDate);
      }

      if (daysAgo && !fromDate) {
        const daysAgoDate = new Date();
        daysAgoDate.setDate(daysAgoDate.getDate() - parseInt(daysAgo));
        query.applicationSubmittedAt.$gte = daysAgoDate;
      }
    }

    // Filter by approval status
    if (status && ["approved", "pending", "rejected"].includes(status)) {
      query.approvalStatus = status;
    }

    // Search functionality
    if (search) {
      const sanitizedSearch = sanitizeString(search);
      query.$or = [
        { firstName: { $regex: sanitizedSearch, $options: "i" } },
        { lastName: { $regex: sanitizedSearch, $options: "i" } },
        { email: { $regex: sanitizedSearch, $options: "i" } },
        { studentId: { $regex: sanitizedSearch, $options: "i" } },
        { position: { $regex: sanitizedSearch, $options: "i" } }, // ✅ Search by position
      ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Sort options
    const sortOptions = {};

    // ✅ **ALLOW SORTING BY APPLICATION DATE**
    if (sortBy === "applicationDate" || sortBy === "applicationSubmittedAt") {
      sortOptions["applicationSubmittedAt"] = order === "desc" ? -1 : 1;
    } else if (sortBy === "createdAt") {
      sortOptions["createdAt"] = order === "desc" ? -1 : 1;
    } else {
      sortOptions[sortBy] = order === "desc" ? -1 : 1;
    }

    // ✅ **Execute query with election population**
    const candidates = await Candidate.find(query, "-__v")
      .populate("approvedBy", "firstName lastName email")
      .populate("rejectedBy", "firstName lastName email")
      .populate({
        path: "electionId",
        select: "title description status startDate endDate",
        populate: {
          path: "positions",
          select: "name description maxCandidates",
        },
      })
      .sort(sortOptions)
      .limit(limit * 1)
      .skip(skip);

    // Get total count for pagination
    const totalCandidates = await Candidate.countDocuments(query);

    // ✅ **Enhanced status counts with election context**
    const statusCounts = await Candidate.aggregate([
      ...(electionId
        ? [{ $match: { electionId: sanitizeString(electionId) } }]
        : []),
      {
        $group: {
          _id: "$approvalStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusSummary = {
      approved: 0,
      pending: 0,
      rejected: 0,
      total: totalCandidates,
    };

    statusCounts.forEach((item) => {
      statusSummary[item._id] = item.count;
    });

    // ✅ **Enhanced response with election information**
    res.json({
      message: "Candidates retrieved successfully",
      filters: {
        electionId: electionId || null,
        positionId: positionId || null,
        status: status || null,
        search: search || null,
      },
      candidates: candidates.map((candidate) => ({
        id: candidate._id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        name: `${candidate.firstName} ${candidate.lastName}`,
        email: candidate.email,
        studentId: candidate.studentId,
        mobileNumber: candidate.mobileNumber,
        department: candidate.department,
        college: candidate.college,
        yearOfStudy: candidate.yearOfStudy,
        gpa: candidate.gpa,
        position: candidate.position,
        approvalStatus: candidate.approvalStatus,
        photoUrl: candidate.photoUrl,
        manifestoUrl: candidate.manifestoUrl,
        transcriptUrl: candidate.transcriptUrl,
        campaignSlogan: candidate.campaignSlogan,

        // ✅ **ENHANCED DATE INFORMATION**
        applicationSubmittedAt:
          candidate.applicationSubmittedAt || candidate.createdAt,
        formattedApplicationDate:
          candidate.applicationSubmittedAt || candidate.createdAt
            ? new Date(
                candidate.applicationSubmittedAt || candidate.createdAt
              ).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Unknown",

        // ✅ **APPLICATION AGE FOR SORTING/FILTERING**
        applicationDaysAgo: Math.floor(
          (new Date() -
            new Date(candidate.applicationSubmittedAt || candidate.createdAt)) /
            (1000 * 60 * 60 * 24)
        ),

        election: candidate.electionId
          ? {
              id: candidate.electionId._id,
              title: candidate.electionId.title,
              status: candidate.electionId.status,
              startDate: candidate.electionId.startDate,
              endDate: candidate.electionId.endDate,
            }
          : null,

        positionDetails: {
          id: candidate.positionId,
          name: candidate.position,
        },

        approvedBy: candidate.approvedBy
          ? {
              id: candidate.approvedBy._id,
              name: `${candidate.approvedBy.firstName} ${candidate.approvedBy.lastName}`,
            }
          : null,
        rejectedBy: candidate.rejectedBy
          ? {
              id: candidate.rejectedBy._id,
              name: `${candidate.rejectedBy.firstName} ${candidate.rejectedBy.lastName}`,
            }
          : null,
        approvedAt: candidate.approvedAt,
        rejectionReason: candidate.rejectionReason,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCandidates / limit),
        totalCandidates,
        limit: parseInt(limit),
        hasNextPage: page < Math.ceil(totalCandidates / limit),
        hasPrevPage: page > 1,
      },
      summary: statusSummary,
    });
  } catch (error) {
    console.error("Error fetching candidates:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// **Get Single Candidate** (Admin only)
exports.getCandidateById = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { candidateId } = req.params;
    const sanitizedCandidateId = sanitizeString(candidateId);

    const candidate = await Candidate.findById(
      sanitizedCandidateId,
      "-password -__v"
    )
      .populate("approvedBy", "firstName lastName email role")
      .populate("rejectedBy", "firstName lastName email role")
      // ✅ **ADD THIS: Populate the election data**
      .populate({
        path: "electionId",
        select:
          "title description status startDate endDate department college level",
      });

    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // In your getCandidateById function
    res.json({
      message: "Candidate retrieved successfully",
      candidate: {
        id: candidate._id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        studentId: candidate.studentId,
        mobileNumber: candidate.mobileNumber,
        department: candidate.department,
        college: candidate.college,
        yearOfStudy: candidate.yearOfStudy,
        gpa: candidate.gpa,
        position: candidate.position,

        election: candidate.electionId
          ? {
              id: candidate.electionId._id,
              title: candidate.electionId.title,
              description: candidate.electionId.description,
              status: candidate.electionId.status,
              startDate: candidate.electionId.startDate,
              endDate: candidate.electionId.endDate,
              department: candidate.electionId.department,
              college: candidate.electionId.college,
              level: candidate.electionId.level,
            }
          : null,

        campaignSlogan: candidate.campaignSlogan,
        approvalStatus: candidate.approvalStatus,
        documents: {
          photoUrl: candidate.photoUrl,
          manifestoUrl: candidate.manifestoUrl,
          transcriptUrl: candidate.transcriptUrl,
        },
        qualifications: candidate.qualifications,
        socialLinks: candidate.socialLinks,

        // ✅ **ENHANCED DATE INFORMATION**
        dates: {
          applicationSubmitted:
            candidate.applicationSubmittedAt || candidate.createdAt,
          registrationDate: candidate.createdAt,
          lastUpdated: candidate.updatedAt,
          approvedAt: candidate.approvedAt || null,
          rejectedAt: candidate.rejectedAt || null,
        },

        // ✅ **FORMATTED DATES FOR DISPLAY**
        formattedDates: {
          applicationSubmitted: candidate.applicationSubmittedAt
            ? new Date(candidate.applicationSubmittedAt).toLocaleDateString(
                "en-US",
                {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }
              )
            : new Date(candidate.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
          registrationDate: new Date(candidate.createdAt).toLocaleDateString(
            "en-US",
            {
              year: "numeric",
              month: "long",
              day: "numeric",
            }
          ),
        },

        // ✅ **TIME SINCE APPLICATION**
        applicationAge: {
          days: Math.floor(
            (new Date() -
              new Date(
                candidate.applicationSubmittedAt || candidate.createdAt
              )) /
              (1000 * 60 * 60 * 24)
          ),
          hours: Math.floor(
            (new Date() -
              new Date(
                candidate.applicationSubmittedAt || candidate.createdAt
              )) /
              (1000 * 60 * 60)
          ),
        },

        approvedBy: candidate.approvedBy
          ? {
              id: candidate.approvedBy._id,
              name: `${candidate.approvedBy.firstName} ${candidate.approvedBy.lastName}`,
              role: candidate.approvedBy.role,
            }
          : null,
        approvedAt: candidate.approvedAt,
        approvalNote: candidate.approvalNote,
        rejectedBy: candidate.rejectedBy
          ? {
              id: candidate.rejectedBy._id,
              name: `${candidate.rejectedBy.firstName} ${candidate.rejectedBy.lastName}`,
              role: candidate.rejectedBy.role,
            }
          : null,
        rejectedAt: candidate.rejectedAt,
        rejectionReason: candidate.rejectionReason,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching candidate:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// **Update Candidate Status** (Admin only)
exports.updateCandidateStatus = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { candidateId } = req.params;
    const { status, note } = req.body;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status. Must be 'approved', 'rejected', or 'pending'",
      });
    }

    const sanitizedCandidateId = sanitizeString(candidateId);
    const candidate = await Candidate.findById(sanitizedCandidateId);

    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Update status
    candidate.approvalStatus = status;

    if (status === "approved") {
      candidate.approvedBy = req.admin.id;
      candidate.approvedAt = new Date();
      candidate.approvalNote = note || "";
      candidate.rejectedBy = null;
      candidate.rejectedAt = null;
      candidate.rejectionReason = null;
    } else if (status === "rejected") {
      candidate.rejectedBy = req.admin.id;
      candidate.rejectedAt = new Date();
      candidate.rejectionReason = note || "No reason provided";
      candidate.approvedBy = null;
      candidate.approvedAt = null;
      candidate.approvalNote = null;
    } else if (status === "pending") {
      candidate.approvedBy = null;
      candidate.approvedAt = null;
      candidate.approvalNote = null;
      candidate.rejectedBy = null;
      candidate.rejectedAt = null;
      candidate.rejectionReason = null;
    }

    await candidate.save();

    res.json({
      message: `Candidate ${status} successfully`,
      candidate: {
        id: candidate._id,
        name: `${candidate.firstName} ${candidate.lastName}`,
        email: candidate.email,
        approvalStatus: candidate.approvalStatus,
        updatedAt: candidate.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating candidate status:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Add this new function to candidate.controller.js

/**
 * GET /api/candidates/:candidateId/profile
 * Get candidate profile with promises (public view)
 */
exports.getCandidateProfile = async (req, res) => {
  try {
    const { candidateId } = req.params;

    // ✅ Get candidate with populated promises
    const candidate = await Candidate.findById(candidateId)
      .populate({
        path: "promises",
        select: "title details createdAt",
        options: { sort: { createdAt: -1 } }, // Sort by newest first
      })
      .populate({
        path: "electionId",
        select: "title description status",
      })
      .select("-transcriptUrl -mobileNumber -__v"); // Exclude sensitive fields

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found",
      });
    }

    // ✅ Only show approved candidates publicly
    if (candidate.approvalStatus !== "approved") {
      return res.status(403).json({
        success: false,
        message: "Candidate profile not available",
        status: candidate.approvalStatus,
      });
    }

    res.json({
      success: true,
      message: "Candidate profile retrieved successfully",
      candidate: {
        id: candidate._id,
        name: `${candidate.firstName} ${candidate.lastName}`,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        studentId: candidate.studentId,
        department: candidate.department,
        college: candidate.college,
        yearOfStudy: candidate.yearOfStudy,
        position: candidate.position,
        campaignSlogan: candidate.campaignSlogan,
        photoUrl: candidate.photoUrl,
        manifestoUrl: candidate.manifestoUrl,
        socialLinks: candidate.socialLinks,

        // ✅ Campaign promises
        promises: candidate.promises || [],
        promiseCount: candidate.promises ? candidate.promises.length : 0,

        // Election info
        election: candidate.electionId
          ? {
              id: candidate.electionId._id,
              title: candidate.electionId.title,
              description: candidate.electionId.description,
              status: candidate.electionId.status,
            }
          : null,

        // Status
        approvalStatus: candidate.approvalStatus,
        registeredAt: candidate.createdAt,
      },
    });
  } catch (error) {
    console.error("Error getting candidate profile:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * GET /api/candidates/my-profile
 * Get authenticated candidate's own profile with promises
 */
exports.getMyProfile = async (req, res) => {
  try {
    const voterId = req.voter.id || req.voter._id;
    const voter = await Voter.findById(voterId);

    if (!voter || voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email })
      .populate({
        path: "promises",
        select: "title details createdAt updatedAt",
        options: { sort: { createdAt: -1 } },
      })
      .populate({
        path: "electionId",
        select: "title description status startDate endDate",
      });

    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    res.json({
      success: true,
      message: "Your profile retrieved successfully",
      candidate: {
        id: candidate._id,
        name: `${candidate.firstName} ${candidate.lastName}`,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        studentId: candidate.studentId,
        mobileNumber: candidate.mobileNumber,
        department: candidate.department,
        college: candidate.college,
        yearOfStudy: candidate.yearOfStudy,
        gpa: candidate.gpa,
        position: candidate.position,
        campaignSlogan: candidate.campaignSlogan,

        // Documents
        documents: {
          photoUrl: candidate.photoUrl,
          manifestoUrl: candidate.manifestoUrl,
          transcriptUrl: candidate.transcriptUrl,
        },

        // Social links
        socialLinks: candidate.socialLinks,

        // ✅ Your campaign promises
        promises: candidate.promises || [],
        promiseCount: candidate.promises ? candidate.promises.length : 0,

        // Election info
        election: candidate.electionId
          ? {
              id: candidate.electionId._id,
              title: candidate.electionId.title,
              description: candidate.electionId.description,
              status: candidate.electionId.status,
              startDate: candidate.electionId.startDate,
              endDate: candidate.electionId.endDate,
            }
          : null,

        // Status and dates
        approvalStatus: candidate.approvalStatus,
        registeredAt: candidate.createdAt,
        lastUpdated: candidate.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error getting my profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET /api/forum/posts
 * Get forum posts with filters
 */
exports.getForumPosts = async (req, res) => {
  try {
    const {
      electionId,
      category = "all",
      position,
      search,
      page = 1,
      limit = 20,
      sortBy = "latest",
    } = req.query;

    // Build query
    let query = { isHidden: false };

    if (electionId) {
      query.election = electionId;
    }

    if (category !== "all") {
      query.category = category;
    }

    if (position) {
      query.position = position;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    // Sort options
    let sortOptions = {};
    switch (sortBy) {
      case "latest":
        sortOptions = { isPinned: -1, createdAt: -1 };
        break;
      case "popular":
        sortOptions = { likeCount: -1, createdAt: -1 };
        break;
      case "discussed":
        sortOptions = { replyCount: -1, createdAt: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    const skip = (page - 1) * limit;

    const posts = await ForumPost.find(query)
      .populate("author", "firstName lastName photoUrl position")
      .populate("election", "title status")
      .populate("position", "name")
      .populate("replies.author", "firstName lastName photoUrl")
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip(skip);

    const totalPosts = await ForumPost.countDocuments(query);

    res.json({
      success: true,
      message: "Forum posts retrieved successfully",
      posts: posts.map((post) => ({
        id: post._id,
        title: post.title,
        content:
          post.content.substring(0, 300) +
          (post.content.length > 300 ? "..." : ""),
        author: {
          id: post.author._id,
          name: `${post.author.firstName} ${post.author.lastName}`,
          photoUrl: post.author.photoUrl,
          type: post.authorType,
          position: post.author.position || null,
        },
        category: post.category,
        tags: post.tags,

        // Engagement metrics
        stats: {
          views: post.views,
          likes: post.likeCount,
          replies: post.replyCount,
        },

        // Status
        isPinned: post.isPinned,
        isLocked: post.isLocked,

        // Timestamps
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        timeAgo: getTimeAgo(post.createdAt),
      })),

      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalPosts / limit),
        totalPosts,
        hasNext: page < Math.ceil(totalPosts / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Error getting forum posts:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * POST /api/forum/posts
 * Create a new forum post
 */
exports.createForumPost = async (req, res) => {
  try {
    const { title, content, category, electionId, positionId, tags } = req.body;

    // Validate required fields
    if (!title || !content || !electionId) {
      return res.status(400).json({
        success: false,
        message: "Title, content, and election ID are required",
      });
    }

    // Get user info
    const voter = await Voter.findById(req.voter.id);
    if (!voter) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    // Determine author type and reference
    let authorId = voter._id;
    let authorType = "Voter";

    if (voter.role === "candidate") {
      const candidate = await Candidate.findOne({ email: voter.email });
      if (candidate) {
        authorId = candidate._id;
        authorType = "Candidate";
      }
    }

    // Create post
    const post = await ForumPost.create({
      title: sanitizeString(title),
      content: sanitizeString(content),
      author: authorId,
      authorType: authorType,
      category: category || "general",
      election: electionId,
      position: positionId || null,
      tags: tags ? tags.map((tag) => sanitizeString(tag)) : [],
    });

    // Populate the created post
    const populatedPost = await ForumPost.findById(post._id)
      .populate("author", "firstName lastName photoUrl position")
      .populate("election", "title")
      .populate("position", "name");

    // Log forum activity
    await SecurityLogger.log({
      event: "Forum Activity",
      user: voter.email,
      userId: voter._id,
      userType: authorType,
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Forum post created",
      severity: "Low",
      category: "Forum",
      metadata: {
        postId: post._id,
        postTitle: title,
        category: category,
        electionId: electionId,
        authorType: authorType,
      },
    });

    res.status(201).json({
      success: true,
      message: "Forum post created successfully",
      post: {
        id: populatedPost._id,
        title: populatedPost.title,
        content: populatedPost.content,
        author: {
          id: populatedPost.author._id,
          name: `${populatedPost.author.firstName} ${populatedPost.author.lastName}`,
          type: populatedPost.authorType,
        },
        category: populatedPost.category,
        createdAt: populatedPost.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating forum post:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * POST /api/forum/posts/:postId/reply
 * Reply to a forum post
 */
exports.replyToPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Reply content is required",
      });
    }

    const post = await ForumPost.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    if (post.isLocked) {
      return res.status(403).json({
        success: false,
        message: "This post is locked and cannot receive replies",
      });
    }

    // Get user info
    const voter = await Voter.findById(req.voter.id);
    if (!voter) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    // Determine author type
    let authorId = voter._id;
    let authorType = "Voter";

    if (voter.role === "candidate") {
      const candidate = await Candidate.findOne({ email: voter.email });
      if (candidate) {
        authorId = candidate._id;
        authorType = "Candidate";
      }
    }

    // Add reply
    post.replies.push({
      author: authorId,
      authorType: authorType,
      content: sanitizeString(content),
    });

    await post.save();

    // Get the newly added reply with populated author
    const updatedPost = await ForumPost.findById(postId).populate(
      "replies.author",
      "firstName lastName photoUrl position"
    );

    const newReply = updatedPost.replies[updatedPost.replies.length - 1];

    res.json({
      success: true,
      message: "Reply added successfully",
      reply: {
        id: newReply._id,
        content: newReply.content,
        author: {
          id: newReply.author._id,
          name: `${newReply.author.firstName} ${newReply.author.lastName}`,
          photoUrl: newReply.author.photoUrl,
          type: newReply.authorType,
        },
        createdAt: newReply.createdAt,
      },
    });
  } catch (error) {
    console.error("Error replying to post:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Helper function for time formatting
function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - new Date(date)) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return new Date(date).toLocaleDateString();
}

/**
 * GET /api/forum/questions/pending
 * Get pending questions for authenticated candidate
 */
exports.getPendingQuestions = async (req, res) => {
  try {
    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    const questions = await ForumQuestion.find({
      candidate: candidate._id,
      status: "pending",
    })
      .populate("voter", "firstName lastName")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      questions: questions.map((q) => ({
        id: q._id,
        title:
          q.question.substring(0, 60) + (q.question.length > 60 ? "..." : ""),
        content: q.question,
        voterName: `${q.voter.firstName} ${q.voter.lastName}`,
        status: q.status,
        createdAt: q.createdAt,
        timeAgo: getTimeAgo(q.createdAt),
      })),
    });
  } catch (error) {
    console.error("Error fetching pending questions:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /api/forum/questions/:questionId/answer
 * Answer a question as candidate
 */
exports.answerForumQuestion = async (req, res) => {
  try {
    const { answer } = req.body;
    const { questionId } = req.params;

    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({ message: "Candidate access required" });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }

    const question = await ForumQuestion.findOneAndUpdate(
      {
        _id: questionId,
        candidate: candidate._id,
        status: "pending",
      },
      {
        answer: sanitizeString(answer),
        status: "answered",
        answeredAt: new Date(),
      },
      { new: true }
    ).populate("voter", "firstName lastName email");

    if (!question) {
      return res
        .status(404)
        .json({ message: "Question not found or already answered" });
    }

    // Optional: Send notification email to voter
    try {
      await sendEmail(
        question.voter.email,
        "Your Question Has Been Answered - SmartVote",
        `${candidate.firstName} ${candidate.lastName} has answered your question.`,
        `
        <h2>Your Question Has Been Answered!</h2>
        <p>Dear ${question.voter.firstName},</p>
        <p><strong>${candidate.firstName} ${candidate.lastName}</strong> has answered your question:</p>
        <blockquote style="background: #f3f4f6; padding: 15px; border-left: 4px solid #2563eb;">
          <strong>Q:</strong> ${question.question}
        </blockquote>
        <blockquote style="background: #ecfdf5; padding: 15px; border-left: 4px solid #10b981;">
          <strong>A:</strong> ${answer}
        </blockquote>
        `
      );
    } catch (emailError) {
      console.error("Failed to send answer notification:", emailError);
    }

    res.json({
      success: true,
      message: "Question answered successfully",
      question: {
        id: question._id,
        content: question.question,
        answer: question.answer,
        status: question.status,
        answeredAt: question.answeredAt,
      },
    });
  } catch (error) {
    console.error("Error answering question:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Helper function for time formatting
function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - new Date(date)) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return new Date(date).toLocaleDateString();
}

/**
 * GET /api/candidates/forum/questions/answered
 * Get answered questions for authenticated candidate
 */
exports.getAnsweredQuestions = async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = "latest" } = req.query;

    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({
        success: false,
        message: "Candidate access required",
      });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate profile not found",
      });
    }

    // Build sort options
    let sortOptions = {};
    switch (sortBy) {
      case "latest":
        sortOptions = { answeredAt: -1 };
        break;
      case "oldest":
        sortOptions = { answeredAt: 1 };
        break;
      case "question_date":
        sortOptions = { createdAt: -1 };
        break;
      default:
        sortOptions = { answeredAt: -1 };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get answered questions
    const questions = await ForumQuestion.find({
      candidate: candidate._id,
      status: "answered",
    })
      .populate("voter", "firstName lastName")
      .populate("election", "title")
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip(skip);

    // Get total count for pagination
    const totalQuestions = await ForumQuestion.countDocuments({
      candidate: candidate._id,
      status: "answered",
    });

    // Log the activity
    await SecurityLogger.log({
      event: "Forum Activity",
      user: voter.email,
      userId: voter._id,
      userType: "Candidate",
      ipAddress: SecurityLogger.getClientIP(req),
      userAgent: req.get("User-Agent") || "Unknown",
      status: "Success",
      details: "Retrieved answered questions from forum",
      severity: "Low",
      category: "Forum",
      metadata: {
        candidateId: candidate._id,
        questionCount: questions.length,
        totalAnsweredQuestions: totalQuestions,
        page: page,
        sortBy: sortBy,
      },
    });

    res.json({
      success: true,
      message: "Answered questions retrieved successfully",
      questions: questions.map((q) => ({
        id: q._id,
        title:
          q.question.substring(0, 60) + (q.question.length > 60 ? "..." : ""),
        content: q.question,
        answer: q.answer,
        voterName: `${q.voter.firstName} ${q.voter.lastName}`,
        electionTitle: q.election?.title || "General",
        status: q.status,

        // Dates
        createdAt: q.createdAt,
        answeredAt: q.answeredAt,
        timeAgo: getTimeAgo(q.createdAt),
        answeredTimeAgo: getTimeAgo(q.answeredAt),

        // Formatted dates for display
        formattedQuestionDate: new Date(q.createdAt).toLocaleDateString(
          "en-US",
          {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }
        ),
        formattedAnswerDate: new Date(q.answeredAt).toLocaleDateString(
          "en-US",
          {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }
        ),

        // Response time calculation
        responseTimeHours: Math.floor(
          (new Date(q.answeredAt) - new Date(q.createdAt)) / (1000 * 60 * 60)
        ),
        responseTimeDays: Math.floor(
          (new Date(q.answeredAt) - new Date(q.createdAt)) /
            (1000 * 60 * 60 * 24)
        ),
      })),

      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalQuestions / limit),
        totalQuestions,
        limit: parseInt(limit),
        hasNext: page < Math.ceil(totalQuestions / limit),
        hasPrev: page > 1,
      },

      summary: {
        totalAnswered: totalQuestions,
        averageResponseTime: await calculateAverageResponseTime(candidate._id),
      },
    });
  } catch (error) {
    console.error("Error fetching answered questions:", error);

    // Log the error
    try {
      await SecurityLogger.log({
        event: "Forum Activity",
        user: req.voter?.email || "Unknown",
        userId: req.voter?.id || null,
        userType: "Candidate",
        ipAddress: SecurityLogger.getClientIP(req),
        userAgent: req.get("User-Agent") || "Unknown",
        status: "Failed",
        details: "Failed to retrieve answered questions",
        severity: "Medium",
        category: "System",
        metadata: {
          endpoint: "/api/candidates/forum/questions/answered",
          error: error.message,
          stack: error.stack,
        },
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * GET /api/candidates/forum/questions/stats
 * Get forum Q&A statistics for authenticated candidate
 */
exports.getForumStats = async (req, res) => {
  try {
    const voter = await Voter.findById(req.voter.id);
    if (voter.role !== "candidate") {
      return res.status(403).json({
        success: false,
        message: "Candidate access required",
      });
    }

    const candidate = await Candidate.findOne({ email: voter.email });
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate profile not found",
      });
    }

    // Get question statistics
    const [
      totalQuestions,
      pendingQuestions,
      answeredQuestions,
      recentQuestions,
      averageResponseTime,
    ] = await Promise.all([
      ForumQuestion.countDocuments({ candidate: candidate._id }),
      ForumQuestion.countDocuments({
        candidate: candidate._id,
        status: "pending",
      }),
      ForumQuestion.countDocuments({
        candidate: candidate._id,
        status: "answered",
      }),
      ForumQuestion.countDocuments({
        candidate: candidate._id,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      }),
      calculateAverageResponseTime(candidate._id),
    ]);

    // Get response rate
    const responseRate =
      totalQuestions > 0
        ? Math.round((answeredQuestions / totalQuestions) * 100)
        : 0;

    res.json({
      success: true,
      message: "Forum statistics retrieved successfully",
      stats: {
        totalQuestions,
        pendingQuestions,
        answeredQuestions,
        recentQuestions, // Questions received in last 7 days
        responseRate: `${responseRate}%`,
        averageResponseTime: {
          hours: averageResponseTime.hours,
          days: averageResponseTime.days,
          formatted: averageResponseTime.formatted,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching forum stats:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Helper function to calculate average response time
async function calculateAverageResponseTime(candidateId) {
  try {
    const answeredQuestions = await ForumQuestion.find({
      candidate: candidateId,
      status: "answered",
      answeredAt: { $exists: true },
    }).select("createdAt answeredAt");

    if (answeredQuestions.length === 0) {
      return {
        hours: 0,
        days: 0,
        formatted: "No answered questions yet",
      };
    }

    const totalResponseTime = answeredQuestions.reduce((total, question) => {
      const responseTime =
        new Date(question.answeredAt) - new Date(question.createdAt);
      return total + responseTime;
    }, 0);

    const averageResponseTimeMs = totalResponseTime / answeredQuestions.length;
    const averageResponseTimeHours = Math.round(
      averageResponseTimeMs / (1000 * 60 * 60)
    );
    const averageResponseTimeDays = Math.round(
      averageResponseTimeMs / (1000 * 60 * 60 * 24)
    );

    let formatted;
    if (averageResponseTimeHours < 24) {
      formatted = `${averageResponseTimeHours} hours`;
    } else {
      formatted = `${averageResponseTimeDays} days`;
    }

    return {
      hours: averageResponseTimeHours,
      days: averageResponseTimeDays,
      formatted,
    };
  } catch (error) {
    console.error("Error calculating average response time:", error);
    return {
      hours: 0,
      days: 0,
      formatted: "Unable to calculate",
    };
  }
}

/**
 * GET /api/candidates/public
 * Get all approved candidates for public selection
 */
exports.getPublicCandidates = async (req, res) => {
  try {
    const { election, position, department } = req.query;

    // Build query
    let query = {
      approvalStatus: "approved",
      // isActive: true,
    };

    if (election) query.electionId = election;
    if (position) query.position = position;
    if (department) query.department = department;

    const candidates = await Candidate.find(query)
      .select("firstName lastName position department photoUrl manifestoUrl")
      .populate("election", "title approvalStatus")
      .sort({ firstName: 1 });

    // Get question stats for each candidate
    const candidatesWithStats = await Promise.all(
      candidates.map(async (candidate) => {
        const [totalQuestions, answeredQuestions] = await Promise.all([
          ForumQuestion.countDocuments({ candidate: candidate._id }),
          ForumQuestion.countDocuments({
            candidate: candidate._id,
            status: "answered",
          }),
        ]);

        const responseRate =
          totalQuestions > 0
            ? Math.round((answeredQuestions / totalQuestions) * 100)
            : 0;

        return {
          id: candidate._id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          name: `${candidate.firstName} ${candidate.lastName}`,
          position: candidate.position,
          department: candidate.department,
          photoUrl: candidate.photoUrl,
          manifesto: candidate.manifesto?.substring(0, 150) + "...",
          election: candidate.election,
          stats: {
            totalQuestions,
            answeredQuestions,
            responseRate: `${responseRate}%`,
          },
        };
      })
    );

    res.json({
      success: true,
      message: "Public candidates retrieved successfully",
      candidates: candidatesWithStats,
    });
  } catch (error) {
    console.error("Error fetching public candidates:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * GET /api/candidates/:candidateId/vote-stats
 * Show candidate's position, their votes, opponents, and vote percentages
 */
function ordinalSuffix(rank) {
  const j = rank % 10,
    k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}

exports.getCandidateVoteStats = async (req, res) => {
  try {
    const { candidateId } = req.params;

    // Get candidate and election info
    const candidate = await Candidate.findById(candidateId);
    if (!candidate)
      return res.status(404).json({ message: "Candidate not found" });

    const election = await Election.findById(candidate.electionId);
    if (!election)
      return res.status(404).json({ message: "Election not found" });

    // Get all candidates for the same position in this election
    const opponents = await Candidate.find({
      electionId: candidate.electionId,
      positionId: candidate.positionId,
      approvalStatus: "approved",
    }).select("firstName lastName position email photoUrl _id");

    // Get votes for this position
    let voteCounts = {};
    let totalVotes = 0;

    election.votes.forEach((voteEntry) => {
      (voteEntry.votes || []).forEach((v) => {
        if (v.positionId.toString() === candidate.positionId.toString()) {
          voteCounts[v.candidateId] = (voteCounts[v.candidateId] || 0) + 1;
          totalVotes++;
        }
      });
    });

    // Build stats for each candidate in this position
    let stats = opponents.map((op) => {
      const votes = voteCounts[op._id.toString()] || 0;
      const percent =
        totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(2) : "0.00";
      return {
        id: op._id,
        name: `${op.firstName} ${op.lastName}`,
        position: op.position,
        photoUrl: op.photoUrl,
        votes,
        percent,
        isYou: op._id.toString() === candidateId,
      };
    });

    // Sort by votes descending
    stats.sort((a, b) => b.votes - a.votes);

    // Assign rank/position
    stats = stats.map((c, idx) => ({
      ...c,
      rank: idx + 1, // Numeric rank
      rankLabel: ordinalSuffix(idx + 1), // Ordinal string, e.g. "1st", "2nd"
    }));

    // Find candidate's own stats
    const yourStats = stats.find((s) => s.isYou);

    res.json({
      success: true,
      position: candidate.position,
      yourVotes: yourStats ? yourStats.votes : 0,
      yourPercent: yourStats ? yourStats.percent : "0.00",
      yourRank: yourStats ? yourStats.rankLabel : null,
      opponents: stats.filter((s) => !s.isYou),
      allCandidates: stats,
      totalVotes,
    });
  } catch (error) {
    console.error("Error getting candidate vote stats:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getMyVoteStats = async (req, res) => {
  try {
    // Get candidate ID from auth/session middleware
    const candidate = await Candidate.findOne({ email: req.voter.email });
    if (!candidate) {
      return res.status(404).json({ message: "Candidate profile not found" });
    }
    req.params.candidateId = candidate._id.toString(); // Set correct ObjectId
    return exports.getCandidateVoteStats(req, res); // Reuse the main function
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
