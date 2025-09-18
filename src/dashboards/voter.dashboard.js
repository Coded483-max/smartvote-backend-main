// src/dashboard/voter.dashboard.js

const Voter = require("../models/voter.model");
const Election = require("../models/election.model");

const getVoterDashboardData = async (req, res) => {
  try {
    // Fetch voter details
    const voter = req.voter;

    // Fetch active elections
    const activeElections = await Election.find({ status: "ongoing" });

    // Prepare the dashboard data
    const dashboardData = {
      voterDetails: {
        firstName: voter.firstName,
        lastName: voter.lastName,
        email: voter.email,
        studentId: voter.studentId,
      },
      activeElections: activeElections,
    };

    res.status(200).json({
      message: "Voter dashboard data retrieved successfully.",
      data: dashboardData,
    });
  } catch (error) {
    console.error("Error fetching voter dashboard data:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getVoterDashboardData };
