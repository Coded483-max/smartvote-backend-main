const Notification = require("../models/notification.model");

// Create notifications for election announcement
const createElectionNotifications = async (voters, election) => {
  console.log(`🔔 Creating notifications for ${voters.length} voters...`);

  const notifications = voters.map((voter) => ({
    recipientId: voter._id,
    recipientType: "voter",
    type: "election_created",
    title: `📢 New Election: ${election.title}`,
    message: `A new ${election.level} level election "${election.title}" has been created. You are eligible to participate and vote.`,
    data: {
      electionId: election._id,
      electionTitle: election.title,
      electionLevel: election.level,
      department: election.department,
      college: election.college,
      startDate: election.startDate,
      endDate: election.endDate,
      positionCount: election.positions.length,
    },
    priority: "high",
  }));

  try {
    const result = await Notification.insertMany(notifications);
    console.log(`✅ Created ${result.length} notifications`);
    return result;
  } catch (error) {
    console.error("❌ Error creating notifications:", error);
    throw error;
  }
};

// Get notifications for a voter
const getVoterNotifications = async (voterId, options = {}) => {
  const { limit = 20, skip = 0, unreadOnly = false, type = null } = options;

  const query = { recipientId: voterId };

  if (unreadOnly) {
    query.read = false;
  }

  if (type) {
    query.type = type;
  }

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

  const unreadCount = await Notification.countDocuments({
    recipientId: voterId,
    read: false,
  });

  return {
    notifications,
    unreadCount,
    total: await Notification.countDocuments(query),
  };
};

// Mark notification as read
const markAsRead = async (notificationId, voterId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientId: voterId, read: false },
    {
      read: true,
      readAt: new Date(),
    },
    { new: true }
  );

  return notification;
};

// Mark all notifications as read for a voter
const markAllAsRead = async (voterId) => {
  const result = await Notification.updateMany(
    { recipientId: voterId, read: false },
    {
      read: true,
      readAt: new Date(),
    }
  );

  return result;
};

module.exports = {
  createElectionNotifications,
  getVoterNotifications,
  markAsRead,
  markAllAsRead,
};
