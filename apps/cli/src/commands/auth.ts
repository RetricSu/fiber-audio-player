import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../lib/config.js';
import { AdminApiClient } from '../lib/api-client.js';
import { ConfigError } from '../lib/types.js';

export function createAuthCommands(): Command {
  const auth = new Command('auth');
  auth.description('Authentication and configuration commands');

  auth
    .command('login')
    .description('Authenticate with the Fiber Audio Player backend')
    .option('-k, --api-key <key>', 'API key for authentication')
    .option('-u, --backend-url <url>', 'Backend URL (default: http://localhost:8787)')
    .action(async (options: { apiKey?: string; backendUrl?: string }) => {
      const spinner = ora();

      try {
        let apiKey = options.apiKey || process.env.FAP_API_KEY;
        let backendUrl = options.backendUrl || process.env.FAP_URL || 'http://localhost:8787';

        if (!apiKey) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'apiKey',
              message: 'Enter your API key:',
              validate: (input: string) => {
                if (!input.trim()) {
                  return 'API key is required';
                }
                return true;
              },
            },
          ]);
          apiKey = answers.apiKey;
        }

        if (!options.backendUrl && !process.env.FAP_URL) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'backendUrl',
              message: 'Enter the backend URL:',
              default: 'http://localhost:8787',
              validate: (input: string) => {
                if (!input.trim()) {
                  return 'Backend URL is required';
                }
                try {
                  new URL(input);
                  return true;
                } catch {
                  return 'Please enter a valid URL';
                }
              },
            },
          ]);
          backendUrl = answers.backendUrl;
        }

        spinner.start('Validating API key...');

        const client = new AdminApiClient({ baseURL: backendUrl!, apiToken: apiKey! });
        const isValid = await client.verifyAuth();

        if (!isValid) {
          spinner.fail('Invalid API key');
          console.error(chalk.red('\nAuthentication failed. Please check your API key and try again.'));
          process.exit(1);
        }

        spinner.succeed('API key validated');

        spinner.start('Saving configuration...');
        const configManager = new ConfigManager();
        await configManager.load();
        configManager.set('apiUrl', backendUrl!);
        configManager.set('apiToken', apiKey!);
        await configManager.save();
        spinner.succeed('Configuration saved');

        const configManagerForPath = new ConfigManager();
        console.log(chalk.green('\n✓ Successfully authenticated with Fiber Audio Player'));
        console.log(chalk.gray(`  Backend: ${backendUrl}`));
        console.log(chalk.gray(`  Config: ${configManagerForPath.getConfigPath()}`));
      } catch (error) {
        spinner.stop();

        if (error instanceof ConfigError) {
          console.error(chalk.red(`\nConfiguration error: ${error.message}`));
        } else if (error instanceof Error) {
          console.error(chalk.red(`\nError: ${error.message}`));
        } else {
          console.error(chalk.red('\nAn unexpected error occurred'));
        }

        process.exit(1);
      }
    });

  auth
    .command('logout')
    .description('Remove stored credentials')
    .action(async () => {
      const spinner = ora();

      try {
        spinner.start('Removing credentials...');
        const configManager = new ConfigManager();
        await configManager.reset();
        spinner.succeed('Credentials removed');

        console.log(chalk.green('\n✓ Successfully logged out'));
      } catch (error) {
        spinner.stop();

        if (error instanceof ConfigError) {
          console.error(chalk.red(`\nConfiguration error: ${error.message}`));
        } else if (error instanceof Error) {
          console.error(chalk.red(`\nError: ${error.message}`));
        } else {
          console.error(chalk.red('\nAn unexpected error occurred'));
        }

        process.exit(1);
      }
    });

  auth
    .command('config')
    .description('Show current configuration')
    .option('-s, --show-token', 'Show the full API token (default: masked)')
    .action(async (options: { showToken?: boolean }) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.load();

        console.log(chalk.bold('\nCurrent Configuration:'));
        console.log(chalk.gray('─'.repeat(50)));

        console.log(`${chalk.cyan('Backend URL:')} ${config.apiUrl}`);

        if (options.showToken) {
          console.log(`${chalk.cyan('API Token:')} ${config.apiToken}`);
        } else {
          const masked = config.apiToken.length > 8
            ? `${config.apiToken.slice(0, 4)}...${config.apiToken.slice(-4)}`
            : '***';
          console.log(`${chalk.cyan('API Token:')} ${masked}`);
          console.log(chalk.gray('  (use --show-token to display full token)'));
        }

        console.log(chalk.gray('─'.repeat(50)));
        const configManagerForPath = new ConfigManager();
        console.log(`${chalk.cyan('Config file:')} ${configManagerForPath.getConfigPath()}`);
        console.log();
      } catch (error) {
        if (error instanceof ConfigError) {
          console.error(chalk.red(`\nNot authenticated. Run 'fap login' first.`));
        } else if (error instanceof Error) {
          console.error(chalk.red(`\nError: ${error.message}`));
        } else {
          console.error(chalk.red('\nAn unexpected error occurred'));
        }

        process.exit(1);
      }
    });

  auth
    .command('doctor')
    .description('Check authentication health and connectivity')
    .action(async () => {
      const spinner = ora();
      const issues: string[] = [];

      console.log(chalk.bold('\n🔍 Running authentication diagnostics...\n'));

      spinner.start('Checking configuration...');
      let config;
      try {
        const configManager = new ConfigManager();
        config = await configManager.load();
        spinner.succeed('Configuration found');
      } catch (error) {
        spinner.fail('Configuration not found');
        issues.push('No configuration file. Run "fap login" to authenticate.');
      }

      if (!config) {
        console.log(chalk.red('\n✗ Diagnostics failed'));
        issues.forEach(issue => console.log(chalk.red(`  • ${issue}`)));
        console.log();
        process.exit(1);
      }

      spinner.start(`Checking backend connectivity (${config.apiUrl})...`);
      try {
        const client = new AdminApiClient({ baseURL: config.apiUrl, apiToken: config.apiToken });
        const isReachable = await client.verifyAuth();

        if (isReachable) {
          spinner.succeed('Backend is reachable');
        } else {
          spinner.fail('Backend is not reachable');
          issues.push(`Cannot connect to backend at ${config.apiUrl}`);
        }
      } catch (error) {
        spinner.fail('Backend connectivity check failed');
        issues.push(`Backend connectivity error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      spinner.start('Validating API token...');
      try {
        const client = new AdminApiClient({ baseURL: config.apiUrl, apiToken: config.apiToken });
        const isValid = await client.verifyAuth();

        if (isValid) {
          spinner.succeed('API token is valid');
        } else {
          spinner.fail('API token is invalid');
          issues.push('API token is invalid or expired. Run "fap login" to re-authenticate.');
        }
      } catch (error) {
        spinner.fail('Token validation failed');
        issues.push(`Token validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      console.log();
      const configManagerForPath = new ConfigManager();
      if (issues.length === 0) {
        console.log(chalk.green('✓ All diagnostics passed'));
        console.log(chalk.gray(`  Backend: ${config.apiUrl}`));
        console.log(chalk.gray(`  Config: ${configManagerForPath.getConfigPath()}`));
        console.log();
        process.exit(0);
      } else {
        console.log(chalk.red('✗ Diagnostics failed'));
        issues.forEach(issue => console.log(chalk.red(`  • ${issue}`)));
        console.log();
        process.exit(1);
      }
    });

  return auth;
}
