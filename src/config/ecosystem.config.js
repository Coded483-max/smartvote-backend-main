module.exports = {
  apps: [
    {
      name: "smartvote-backend",
      script: "./src/server.js",
      instances: "max", // Use all CPU cores
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      max_memory_restart: "1G",
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      watch: false,
      ignore_watch: ["node_modules", "logs", "build"],
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
