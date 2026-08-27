module.exports = {
  apps: [
    {
      name: "interakt-api",
      cwd: "./backend",
      script: "dist/server.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      time: true,
      kill_timeout: 10000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
