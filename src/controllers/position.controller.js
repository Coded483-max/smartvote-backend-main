// controllers/position.controller.js
const PositionTemplate = require("../models/positionTemplate");

exports.getPositionsByLevel = async (req, res) => {
  try {
    const { level, department } = req.query;

    if (!level) {
      return res.status(400).json({ message: "Level is required" });
    }

    // Build query
    let query = { level, isActive: true };

    // Add department filter for departmental elections
    if (level === "departmental" && department) {
      query.$or = [
        { levelSpecific: department },
        { levelSpecific: { $exists: false } }, // Generic departmental positions
      ];
    }

    const templates = await PositionTemplate.find(query).sort({
      createdAt: -1,
    });

    if (!templates.length) {
      return res.json({
        message: "No position templates found for this level",
        positions: [],
        level,
      });
    }

    // Combine all positions from templates (could be multiple templates)
    const allPositions = [];
    templates.forEach((template) => {
      template.positions.forEach((position) => {
        allPositions.push({
          id: position._id,
          name: position.name,
          description: position.description,
          defaultRequirements: position.defaultRequirements,
          isRequired: position.isRequired,
          order: position.order,
          templateId: template._id,
          templateName: template.levelSpecific || `${template.level} positions`,
        });
      });
    });

    // Sort by order
    allPositions.sort((a, b) => a.order - b.order);

    res.json({
      message: `Available positions for ${level} level retrieved`,
      level,
      department: department || null,
      positionCount: allPositions.length,
      positions: allPositions,
    });
  } catch (error) {
    console.error("Get positions by level error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.createPositionTemplate = async (req, res) => {
  try {
    const { level, levelSpecific, positions } = req.body;

    // Validate admin permissions
    if (req.admin.role !== "super-admin") {
      return res
        .status(403)
        .json({ message: "Only super admin can create position templates" });
    }

    const template = await PositionTemplate.create({
      level,
      levelSpecific,
      positions: positions.map((pos, index) => ({
        name: pos.name.trim(),
        description: pos.description?.trim() || "",
        defaultRequirements: pos.defaultRequirements || {},
        isRequired: pos.isRequired !== false,
        order: pos.order || index + 1,
      })),
      createdBy: req.admin.id,
    });

    res.status(201).json({
      message: "Position template created successfully",
      template,
    });
  } catch (error) {
    console.error("Create position template error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
