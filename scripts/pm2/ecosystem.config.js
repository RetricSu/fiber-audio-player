/**
 * PM2 ecosystem configuration for Fiber Audio Player backend
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 */

module.exports = {
  apps: [
    {
      name: "fiber-audio-backend",
      script: "./backend/dist/server.js",
      cwd: "./",
      instances: 1,
      exec_mode: "fork",
      node_args: "-r dotenv/config",
      env: {
        NODE_ENV: "production",
        PORT: 8787,
        DOTENV_CONFIG_PATH: "./backend/.env",
      },
    },
  ],
};
