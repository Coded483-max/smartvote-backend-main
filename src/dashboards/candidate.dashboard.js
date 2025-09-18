const Candidate = require("../models/candidate.model");

// ✅ Get candidate dashboard overview
exports.getCandidateDashboard = async (req, res) => {
  try {
    const candidateId = req.params.id;

    const candidate = await Candidate.findById(candidateId).lean();

    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found." });
    }

    if (candidate.approvalStatus !== "approved") {
      return res.status(403).json({ message: "Access denied. Candidate not approved yet." });
    }

    const dashboardData = {
      fullName: `${candidate.firstName} ${candidate.lastName}`,
      position: candidate.position,
      approvalStatus: candidate.approvalStatus,
      approvalMessage: candidate.approvalStatusMessage,
      campaignPromises: candidate.campaignPromises || [],
      forumInteractions: candidate.forumInteractions || [],
      socialMediaHandles: candidate.socialMediaHandles || {},
      message: "Candidate dashboard data retrieved successfully",
    };

    res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Error fetching candidate dashboard:", error);
    res.status(500).json({ message: "Server error" });
  }
};
