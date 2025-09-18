exports.checkHealth = (req, res) => {
    res.status(200).json({ message: "API is healthy and running!" });
  };
  