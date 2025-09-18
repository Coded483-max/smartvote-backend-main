const Election = require("../models/election.model");

//  1. Get Election Summary
exports.getElectionSummary = async (req, res) => {
  try {
    const total = await Election.countDocuments();
    const upcoming = await Election.countDocuments({ status: "upcoming" });
    const ongoing = await Election.countDocuments({ status: "ongoing" });
    const completed = await Election.countDocuments({ status: "completed" });

    res.status(200).json({
      total,
      upcoming,
      ongoing,
      completed,
    });
  } catch (err) {
    console.error("Election Summary Error:", err);
    res.status(500).json({ message: "Server error fetching election summary." });
  }
};

//  2. Get Elections Grouped by Status
exports.getElectionsByStatus = async (req, res) => {
  try {
    const upcoming = await Election.find({ status: "upcoming" }).sort({ startDate: 1 });
    const ongoing = await Election.find({ status: "ongoing" }).sort({ endDate: 1 });
    const completed = await Election.find({ status: "completed" }).sort({ endDate: -1 });

    res.status(200).json({
      upcoming,
      ongoing,
      completed,
    });
  } catch (err) {
    console.error("Election Status Error:", err);
    res.status(500).json({ message: "Server error fetching elections by status." });
  }
};
