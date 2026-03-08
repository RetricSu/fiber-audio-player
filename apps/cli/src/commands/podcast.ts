import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { ConfigManager } from '../lib/config.js';
import { AdminApiClient } from '../lib/api-client.js';
import { ConfigError, ApiError, Podcast } from '../lib/types.js';

export function createPodcastCommands(): Command {
  const podcast = new Command('podcast');
  podcast.description('Podcast management commands');

  // Helper to get configured API client
  async function getApiClient(): Promise<AdminApiClient> {
    const configManager = new ConfigManager();
    const config = await configManager.load();

    if (!config.apiToken) {
      throw new ConfigError('Not authenticated. Run "fap auth login" first.');
    }

    return new AdminApiClient({
      baseURL: config.apiUrl,
      apiToken: config.apiToken,
    });
  }

  // Helper to handle errors
  function handleError(error: unknown): never {
    if (error instanceof ConfigError) {
      console.error(chalk.red(`\nConfiguration error: ${error.message}`));
    } else if (error instanceof ApiError) {
      console.error(chalk.red(`\nAPI error: ${error.message}`));
      if (error.details && error.details.length > 0) {
        error.details.forEach((detail) => {
          console.error(chalk.red(`  • ${detail.path.join('.')}: ${detail.message}`));
        });
      }
    } else if (error instanceof Error) {
      console.error(chalk.red(`\nError: ${error.message}`));
    } else {
      console.error(chalk.red('\nAn unexpected error occurred'));
    }
    process.exit(1);
  }

  // Helper to format date
  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  // Helper to truncate text
  function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }

  // ============================================================================
  // Create Podcast
  // ============================================================================
  podcast
    .command('create')
    .description('Create a new podcast')
    .option('-t, --title <title>', 'Podcast title')
    .option('-d, --description <description>', 'Podcast description')
    .option('-i, --interactive', 'Use interactive prompts')
    .action(async (options: { title?: string; description?: string; interactive?: boolean }) => {
      const spinner = ora();

      try {
        let title = options.title;
        let description = options.description;

        // Interactive mode if requested or if required fields are missing
        if (options.interactive || !title) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'title',
              message: 'Podcast title:',
              default: title,
              validate: (input: string) => {
                if (!input.trim()) {
                  return 'Title is required';
                }
                if (input.length > 255) {
                  return 'Title must be 255 characters or less';
                }
                return true;
              },
            },
            {
              type: 'input',
              name: 'description',
              message: 'Podcast description (optional):',
              default: description,
            },
          ]);
          title = answers.title;
          description = answers.description;
        }

        if (!title) {
          console.error(chalk.red('Error: Title is required'));
          process.exit(1);
        }

        spinner.start('Creating podcast...');

        const client = await getApiClient();
        const newPodcast = await client.createPodcast({
          title: title.trim(),
          description: description?.trim(),
        });

        spinner.succeed('Podcast created successfully');

        console.log(chalk.green('\n✓ Created podcast:'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`${chalk.cyan('ID:')}          ${newPodcast.id}`);
        console.log(`${chalk.cyan('Title:')}       ${newPodcast.title}`);
        console.log(`${chalk.cyan('Description:')} ${newPodcast.description || '(none)'}`);
        console.log(`${chalk.cyan('Created:')}     ${formatDate(newPodcast.created_at)}`);
        console.log(chalk.gray('─'.repeat(50)));
      } catch (error) {
        spinner.stop();
        handleError(error);
      }
    });

  // ============================================================================
  // List Podcasts
  // ============================================================================
  podcast
    .command('list')
    .description('List all podcasts')
    .option('-f, --format <format>', 'Output format: table, json, csv', 'table')
    .option('-o, --output <file>', 'Write output to file')
    .action(async (options: { format?: string; output?: string }) => {
      const spinner = ora();

      try {
        spinner.start('Fetching podcasts...');

        const client = await getApiClient();
        const podcasts = await client.listPodcasts();

        spinner.stop();

        if (podcasts.length === 0) {
          console.log(chalk.yellow('\nNo podcasts found.'));
          return;
        }

        // Get episode counts for each podcast
        spinner.start('Fetching episode counts...');
        const episodeCounts: Record<string, number> = {};
        for (const p of podcasts) {
          try {
            const episodes = await client.listEpisodes(p.id);
            episodeCounts[p.id] = episodes.length;
          } catch {
            episodeCounts[p.id] = 0;
          }
        }
        spinner.stop();

        const format = options.format?.toLowerCase() || 'table';
        let output = '';

        switch (format) {
          case 'json':
            output = JSON.stringify(
              podcasts.map((p) => ({
                ...p,
                episodes: episodeCounts[p.id] || 0,
              })),
              null,
              2
            );
            break;

          case 'csv':
            output = 'ID,Title,Episodes,Created\n';
            output += podcasts
              .map(
                (p) =>
                  `"${p.id}","${p.title.replace(/"/g, '""')}",${episodeCounts[p.id] || 0},${formatDate(
                    p.created_at
                  )}`
              )
              .join('\n');
            break;

          case 'table':
          default: {
            const table = new Table({
              head: [chalk.bold('ID'), chalk.bold('Title'), chalk.bold('Episodes'), chalk.bold('Created')],
              colWidths: [38, 30, 10, 25],
              wordWrap: true,
            });

            podcasts.forEach((p) => {
              table.push([
                p.id,
                truncate(p.title, 27),
                episodeCounts[p.id] || 0,
                formatDate(p.created_at),
              ]);
            });

            output = table.toString();
            break;
          }
        }

        if (options.output) {
          const fs = await import('fs');
          await fs.promises.writeFile(options.output, output);
          console.log(chalk.green(`\n✓ Output written to ${options.output}`));
        } else {
          console.log();
          console.log(output);
          console.log(chalk.gray(`\nTotal: ${podcasts.length} podcast${podcasts.length !== 1 ? 's' : ''}`));
        }
      } catch (error) {
        spinner.stop();
        handleError(error);
      }
    });

  // ============================================================================
  // Get Podcast
  // ============================================================================
  podcast
    .command('get')
    .description('Get podcast details')
    .argument('<id>', 'Podcast ID')
    .option('-e, --include-episodes', 'Include episode list')
    .action(async (id: string, options: { includeEpisodes?: boolean }) => {
      const spinner = ora();

      try {
        spinner.start('Fetching podcast...');

        const client = await getApiClient();
        const podcastData = await client.getPodcast(id);

        spinner.stop();

        console.log(chalk.bold('\nPodcast Details:'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`${chalk.cyan('ID:')}          ${podcastData.id}`);
        console.log(`${chalk.cyan('Title:')}       ${podcastData.title}`);
        console.log(`${chalk.cyan('Description:')} ${podcastData.description || '(none)'}`);
        console.log(`${chalk.cyan('Created:')}     ${formatDate(podcastData.created_at)}`);

        if (options.includeEpisodes) {
          spinner.start('Fetching episodes...');
          const episodes = await client.listEpisodes(id);
          spinner.stop();

          console.log(chalk.gray('─'.repeat(50)));
          console.log(chalk.bold(`Episodes (${episodes.length}):`));

          if (episodes.length === 0) {
            console.log(chalk.gray('  No episodes'));
          } else {
            const table = new Table({
              head: [chalk.bold('ID'), chalk.bold('Title'), chalk.bold('Status'), chalk.bold('Duration')],
              colWidths: [38, 30, 12, 10],
            });

            episodes.forEach((ep) => {
              table.push([
                ep.id,
                truncate(ep.title, 27),
                ep.status,
                ep.duration ? `${ep.duration}s` : '-',
              ]);
            });

            console.log(table.toString());
          }
        }

        console.log(chalk.gray('─'.repeat(50)));
      } catch (error) {
        spinner.stop();
        handleError(error);
      }
    });

  // ============================================================================
  // Update Podcast
  // ============================================================================
  podcast
    .command('update')
    .description('Update podcast metadata')
    .argument('<id>', 'Podcast ID')
    .option('-t, --title <title>', 'New title')
    .option('-d, --description <description>', 'New description')
    .action(async (id: string, options: { title?: string; description?: string }) => {
      const spinner = ora();

      try {
        // Validate at least one field is provided
        if (!options.title && options.description === undefined) {
          console.error(chalk.red('Error: At least one field to update is required (--title or --description)'));
          process.exit(1);
        }

        const updateData: { title?: string; description?: string } = {};
        if (options.title) updateData.title = options.title.trim();
        if (options.description !== undefined) updateData.description = options.description.trim();

        spinner.start('Updating podcast...');

        const client = await getApiClient();
        const updatedPodcast = await client.updatePodcast(id, updateData);

        spinner.succeed('Podcast updated successfully');

        console.log(chalk.green('\n✓ Updated podcast:'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`${chalk.cyan('ID:')}          ${updatedPodcast.id}`);
        console.log(`${chalk.cyan('Title:')}       ${updatedPodcast.title}`);
        console.log(`${chalk.cyan('Description:')} ${updatedPodcast.description || '(none)'}`);
        console.log(`${chalk.cyan('Created:')}     ${formatDate(updatedPodcast.created_at)}`);
        console.log(chalk.gray('─'.repeat(50)));
      } catch (error) {
        spinner.stop();
        handleError(error);
      }
    });

  // ============================================================================
  // Delete Podcast
  // ============================================================================
  podcast
    .command('delete')
    .description('Delete a podcast and all its episodes')
    .argument('<id>', 'Podcast ID')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (id: string, options: { force?: boolean }) => {
      const spinner = ora();

      try {
        // Get podcast details first for confirmation
        spinner.start('Fetching podcast details...');
        const client = await getApiClient();
        const podcastData = await client.getPodcast(id);
        spinner.stop();

        // Confirmation prompt unless --force is used
        if (!options.force) {
          console.log(chalk.yellow('\n⚠️  Warning: This will delete the podcast and ALL its episodes!'));
          console.log(chalk.gray(`   Podcast: ${podcastData.title} (${id})`));

          const answers = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Are you sure you want to delete this podcast?',
              default: false,
            },
          ]);

          if (!answers.confirm) {
            console.log(chalk.gray('\nDeletion cancelled.'));
            process.exit(0);
          }
        }

        spinner.start('Deleting podcast...');

        const message = await client.deletePodcast(id);

        spinner.succeed('Podcast deleted successfully');
        console.log(chalk.green(`\n✓ ${message}`));
      } catch (error) {
        spinner.stop();
        handleError(error);
      }
    });

  return podcast;
}
