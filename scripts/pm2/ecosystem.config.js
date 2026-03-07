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
      script: "./backend/dist/index.js",
      cwd: "./",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 8787,
      },
      // Load environment variables from .env file
      // Make sure to create backend/.env with required variables
      env_file: "./backend/.env",
    },
  ],
};
