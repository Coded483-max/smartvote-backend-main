const mongoose = require("mongoose");
const PositionTemplate = require("../src/models/positionTemplate");
require("dotenv").config();

const defaultTemplates = [
  {
    level: "university",
    positions: [
      {
        name: "Student Body President",
        description: "Lead the student government",
        order: 1,
      },
      {
        name: "Student Body Vice President",
        description: "Assist the president",
        order: 2,
      },
      {
        name: "Secretary General",
        description: "Handle documentation and records",
        order: 3,
      },
      {
        name: "Financial Secretary",
        description: "Manage student government finances",
        order: 4,
      },
      {
        name: "Public Relations Officer",
        description: "Handle communications and outreach",
        order: 5,
      },
      {
        name: "Sports and Recreation Director",
        description: "Oversee sports and recreational activities",
        order: 6,
      },
    ],
  },
  {
    level: "college",
    positions: [
      {
        name: "College Representative",
        description: "Represent the college in university matters",
        order: 1,
      },
      {
        name: "Academic Coordinator",
        description: "Coordinate academic activities",
        order: 2,
      },
      {
        name: "Social Events Manager",
        description: "Organize college social events",
        order: 3,
      },
      {
        name: "Welfare Officer",
        description: "Handle student welfare issues",
        order: 4,
      },
    ],
  },
  {
    level: "departmental",
    positions: [
      {
        name: "Department Representative",
        description: "Represent the department",
        order: 1,
      },
      {
        name: "Class President",
        description: "Lead departmental activities",
        order: 2,
      },
      {
        name: "Academic Coordinator",
        description: "Coordinate department academic matters",
        order: 3,
      },
      {
        name: "Social Secretary",
        description: "Organize departmental social events",
        order: 4,
      },
    ],
  },
];

const seedPositions = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Clear existing templates
    await PositionTemplate.deleteMany({});
    console.log("Cleared existing position templates");

    // Insert default templates
    for (const template of defaultTemplates) {
      await PositionTemplate.create({
        ...template,
        isActive: true,
        createdBy: null, // System created
      });
      console.log(
        `✅ Created ${template.level} position template with ${template.positions.length} positions`
      );
    }

    console.log("🚀 All position templates seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed positions error:", error);
    process.exit(1);
  }
};

seedPositions();
