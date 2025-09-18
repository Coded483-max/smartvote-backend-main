const Admin = require("../models/admin.model");
const adminDashboard = require("./admin.dashboard"); // Reuse base dashboard

// @desc Super Admin Dashboard - extends admin dashboard
exports.getSuperAdminDashboard = async (req, res) => {
  try {
    // Get the base stats from admin dashboard
    const adminStats = await new Promise((resolve, reject) => {
      const fakeRes = {
        status: () => ({
          json: resolve,
        }),
        json: resolve,
      };
      adminDashboard.getAdminDashboard(req, fakeRes).catch(reject);
    });

    const totalAdmins = await Admin.countDocuments();

    res.status(200).json({
      ...adminStats,
      totalAdmins,
    });
  } catch (error) {
    console.error("Super Admin Dashboard Error:", error);
    res.status(500).json({ message: "Dashboard server error" });
  }
};
