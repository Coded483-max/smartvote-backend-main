// **Get All Available Colleges** (for frontend dropdowns)
exports.getAllColleges = async (req, res) => {
  try {
    const colleges = [
      "College of Basic And Applied Sciences",
      "College of Humanities",
      "College of Health Sciences",
      "College of Agriculture and Consumer Sciences",
      "College of Engineering",
      "School of Law",
      "Business School",
    ];

    res.json({
      message: "Colleges retrieved successfully",
      colleges: colleges.map((college, index) => ({
        id: index + 1,
        name: college,
        value: college,
      })),
    });
  } catch (error) {
    console.error("Error fetching colleges:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// **Get All Available Departments** (for frontend dropdowns)
exports.getAllDepartments = async (req, res) => {
  try {
    const departments = [
      // College of Basic and Applied Sciences
      "Computer Science",
      "Information Technology",
      "Mathematics",
      "Statistics",
      "Physics",
      "Chemistry",
      "Biology",
      "Geology",
      "Geography",

      // College of Humanities
      "Economics",
      "Political Science",
      "Sociology",
      "Psychology",
      "English",
      "French",
      "Akan",
      "History",
      "Philosophy",
      "Religious Studies",
      "Fine Arts",
      "Music",
      "Theatre Arts",
      "Dance",

      // College of Health Sciences
      "Nursing",
      "Medicine",
      "Pharmacy",
      "Dentistry",
      "Veterinary Medicine",

      // College of Agriculture and Consumer Sciences
      "Agriculture",
      "Food Science",

      // College of Engineering
      "Engineering",
      "Architecture",
      "Planning",

      // School of Law
      "Law",

      // Business School
      "Business",
      "Accounting",
      "Marketing",
      "Management",
      "Finance",
    ];

    res.json({
      message: "Departments retrieved successfully",
      departments: departments.map((department, index) => ({
        id: index + 1,
        name: department,
        value: department,
      })),
    });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// **Get Departments by College** (for hierarchical dropdowns)
exports.getDepartmentsByCollege = async (req, res) => {
  try {
    const { college } = req.query;

    console.log("🔍 Fetching departments for college:", college);

    if (!college) {
      return res.status(400).json({
        message: "College query parameter is required",
      });
    }

    const collegeMapping = {
      "College of Basic And Applied Sciences": [
        "Computer Science",
        "Information Technology",
        "Mathematics",
        "Statistics",
        "Physics",
        "Chemistry",
        "Biology",
        "Geology",
        "Geography",
      ],
      "College of Humanities": [
        "Economics",
        "Political Science",
        "Sociology",
        "Psychology",
        "English",
        "French",
        "Akan",
        "History",
        "Philosophy",
        "Religious Studies",
        "Fine Arts",
        "Music",
        "Theatre Arts",
        "Dance",
      ],
      "College of Health Sciences": [
        "Nursing",
        "Medicine",
        "Pharmacy",
        "Dentistry",
        "Veterinary Medicine",
      ],
      "College of Agriculture and Consumer Sciences": [
        "Agriculture",
        "Food Science",
      ],
      "College of Engineering": ["Engineering", "Architecture", "Planning"],
      "School of Law": ["Law"],
      "Business School": [
        "Business",
        "Accounting",
        "Marketing",
        "Management",
        "Finance",
      ],
    };

    const departments = collegeMapping[college];

    if (!departments) {
      console.log("❌ College not found:", college);
      console.log("📋 Available colleges:", Object.keys(collegeMapping));
      return res.status(404).json({
        message: "College not found",
        availableColleges: Object.keys(collegeMapping),
      });
    }

    console.log(`✅ Found ${departments.length} departments for ${college}`);

    res.json({
      message: "Departments retrieved successfully",
      college,
      departments: departments.map((department, index) => ({
        id: index + 1,
        name: department,
        value: department,
      })),
    });
  } catch (error) {
    console.error("Error fetching departments by college:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// **Get Academic Years** (for dropdowns)
exports.getAcademicYears = async (req, res) => {
  try {
    const years = [
      { id: 1, name: "Level 100", value: 1 },
      { id: 2, name: "Level 200", value: 2 },
      { id: 3, name: "Level 300", value: 3 },
      { id: 4, name: "Level 400", value: 4 },
    ];

    res.json({
      message: "Academic years retrieved successfully",
      years,
    });
  } catch (error) {
    console.error("Error fetching academic years:", error);
    res.status(500).json({ message: "Server error" });
  }
};
