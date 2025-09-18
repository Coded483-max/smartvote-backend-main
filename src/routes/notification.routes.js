const express = require("express");
const router = express.Router();
const { verifyVoter } = require("../middlewares/auth.middleware");
const {
  getVoterNotifications,
  markAsRead,
  markAllAsRead,
} = require("../services/Notification");

// Get notifications for authenticated voter
router.get("/", verifyVoter, async (req, res) => {
  try {
    const voterId = req.voter._id;
    const { limit = 20, skip = 0, unreadOnly = false, type } = req.query;

    const result = await getVoterNotifications(voterId, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      unreadOnly: unreadOnly === "true",
      type,
    });

    res.json({
      message: "Notifications retrieved successfully",
      ...result,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get unread notification count
router.get("/unread-count", verifyVoter, async (req, res) => {
  try {
    const voterId = req.voter._id;
    const result = await getVoterNotifications(voterId, { limit: 0 });

    res.json({
      unreadCount: result.unreadCount,
    });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Mark specific notification as read
router.patch("/:notificationId/read", verifyVoter, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const voterId = req.voter._id;

    const notification = await markAsRead(notificationId, voterId);

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found or already read",
      });
    }

    res.json({
      message: "Notification marked as read",
      notification,
    });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Mark all notifications as read
router.patch("/read-all", verifyVoter, async (req, res) => {
  try {
    const voterId = req.voter._id;
    const result = await markAllAsRead(voterId);

    res.json({
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Mark all as read error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
