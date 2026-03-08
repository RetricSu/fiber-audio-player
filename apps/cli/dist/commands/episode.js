import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { promises as fs } from 'fs';
import path from 'path';
import { ConfigManager } from '../lib/config.js';
import { AdminApiClient } from '../lib/api-client.js';
import { ConfigError, ApiError } from '../lib/types.js';
import { formatDuration, formatFileSize, formatTimestamp, validateFile } from '../lib/utils.js';
export function createEpisodeCommands() {
    const episode = new Command('episode');
    episode.description('Episode management commands');
    // Helper to create API client with config
    async function createClient() {
        const configManager = new ConfigManager();
        const config = await configManager.load();
        if (!config.apiToken) {
            throw new ConfigError('Not authenticated. Run "fap login" first.');
        }
        return new AdminApiClient({
            baseURL: config.apiUrl,
            apiToken: config.apiToken,
        });
    }
    // Helper to handle errors consistently
    function handleError(error) {
        if (error instanceof ConfigError) {
            console.error(chalk.red(`\nConfiguration error: ${error.message}`));
        }
        else if (error instanceof ApiError) {
            console.error(chalk.red(`\nAPI Error${error.statusCode ? ` (${error.statusCode})` : ''}: ${error.message}`));
            if (error.details && error.details.length > 0) {
                error.details.forEach((detail) => {
                    console.error(chalk.red(`  - ${detail.path.join('.')}: ${detail.message}`));
                });
            }
        }
        else if (error instanceof Error) {
            console.error(chalk.red(`\nError: ${error.message}`));
        }
        else {
            console.error(chalk.red('\nAn unexpected error occurred'));
        }
        process.exit(1);
    }
    // ============================================================================
    // Create
    // ============================================================================
    episode
        .command('create')
        .description('Create a new episode')
        .requiredOption('--podcast-id <id>', 'Podcast ID')
        .requiredOption('--title <title>', 'Episode title')
        .option('--description <desc>', 'Episode description')
        .option('--price-per-second <price>', 'Price per second in shannon', '10000')
        .option('--file <path>', 'Audio file to upload after creation')
        .option('--publish', 'Publish episode after upload (if ready)')
        .option('--wait', 'Wait for transcoding to complete')
        .action(async (options) => {
        const spinner = ora();
        try {
            const client = await createClient();
            // Create episode
            spinner.start('Creating episode...');
            const episode = await client.createEpisode({
                podcast_id: options.podcastId,
                title: options.title,
                description: options.description,
                price_per_second: options.pricePerSecond,
            });
            spinner.succeed(`Episode created: ${episode.title}`);
            console.log(chalk.green(`\n✓ Created episode:`));
            console.log(`  ID: ${episode.id}`);
            console.log(`  Title: ${episode.title}`);
            console.log(`  Status: ${episode.status}`);
            console.log(`  Price: ${episode.price_per_second} shannon/s`);
            // Upload file if provided
            if (options.file) {
                console.log();
                spinner.start(`Validating file: ${options.file}...`);
                const validation = await validateFile(options.file);
                if (!validation.valid) {
                    spinner.fail(`Invalid file: ${validation.error}`);
                    process.exit(1);
                }
                spinner.succeed(`File validated: ${formatFileSize(validation.size)}`);
                spinner.start('Uploading audio file...');
                const fileBuffer = await fs.readFile(options.file);
                const fileName = path.basename(options.file);
                const uploadResult = await client.uploadEpisodeAudio(episode.id, fileBuffer, fileName, validation.mimeType);
                spinner.succeed('File uploaded');
                console.log(`  ${uploadResult.message}`);
                // Wait for transcoding if requested
                if (options.wait) {
                    console.log();
                    spinner.start('Waiting for transcoding to complete...');
                    const transcodedEpisode = await client.pollTranscodingStatus(episode.id);
                    spinner.succeed(`Transcoding complete: ${formatDuration(transcodedEpisode.duration || 0)}`);
                }
                // Publish if requested and status is ready
                if (options.publish) {
                    const currentEpisode = await client.getEpisode(episode.id);
                    if (currentEpisode.status === 'ready') {
                        spinner.start('Publishing episode...');
                        const publishResult = await client.publishEpisode(episode.id);
                        spinner.succeed('Episode published');
                        console.log(`  ${publishResult.message}`);
                    }
                    else if (currentEpisode.status === 'processing' && !options.wait) {
                        console.log(chalk.yellow('\n⚠ Episode is still processing. Use --wait to wait for transcoding before publishing.'));
                    }
                    else if (currentEpisode.status !== 'published') {
                        console.log(chalk.yellow(`\n⚠ Cannot publish: episode status is ${currentEpisode.status}`));
                    }
                }
            }
            console.log();
            console.log(chalk.gray(`Episode ID: ${episode.id}`));
        }
        catch (error) {
            spinner.stop();
            handleError(error);
        }
    });
    // ============================================================================
    // List
    // ============================================================================
    episode
        .command('list')
        .description('List episodes')
        .option('--podcast-id <id>', 'Filter by podcast ID')
        .option('--status <status>', 'Filter by status (draft, processing, ready, published, all)', 'all')
        .action(async (options) => {
        const spinner = ora();
        try {
            const client = await createClient();
            // Validate status
            const validStatuses = ['draft', 'processing', 'ready', 'published'];
            const statusFilter = options.status === 'all' ? null : options.status;
            if (options.status !== 'all' && !validStatuses.includes(statusFilter)) {
                console.error(chalk.red(`\nInvalid status: ${options.status}`));
                console.error(chalk.red(`Valid statuses: ${validStatuses.join(', ')}, all`));
                process.exit(1);
            }
            // Fetch episodes
            spinner.start('Fetching episodes...');
            let episodes = await client.listEpisodes(options.podcastId || '');
            spinner.stop();
            // Filter by status if specified
            if (statusFilter) {
                episodes = episodes.filter((ep) => ep.status === statusFilter);
            }
            if (episodes.length === 0) {
                console.log(chalk.yellow('\nNo episodes found.'));
                if (options.podcastId) {
                    console.log(chalk.gray(`  Podcast ID: ${options.podcastId}`));
                }
                if (options.status !== 'all') {
                    console.log(chalk.gray(`  Status filter: ${options.status}`));
                }
                return;
            }
            // Create table
            const table = new Table({
                head: [chalk.bold('ID'), chalk.bold('Title'), chalk.bold('Duration'), chalk.bold('Status'), chalk.bold('Price')],
                colWidths: [38, 40, 12, 12, 15],
                style: {
                    head: [],
                    border: [],
                },
            });
            episodes.forEach((ep) => {
                const statusColor = {
                    draft: chalk.gray,
                    processing: chalk.yellow,
                    ready: chalk.green,
                    published: chalk.cyan,
                }[ep.status];
                table.push([
                    ep.id,
                    ep.title.length > 37 ? ep.title.slice(0, 34) + '...' : ep.title,
                    ep.duration ? formatDuration(ep.duration) : '-',
                    statusColor(ep.status),
                    ep.price_per_second + ' shn',
                ]);
            });
            console.log();
            console.log(table.toString());
            console.log(chalk.gray(`\nTotal: ${episodes.length} episode(s)`));
        }
        catch (error) {
            spinner.stop();
            handleError(error);
        }
    });
    // ============================================================================
    // Get
    // ============================================================================
    episode
        .command('get')
        .description('Get episode details')
        .argument('<id>', 'Episode ID')
        .action(async (id) => {
        const spinner = ora();
        try {
            const client = await createClient();
            spinner.start('Fetching episode...');
            const episode = await client.getEpisode(id);
            spinner.stop();
            console.log();
            console.log(chalk.bold('Episode Details'));
            console.log(chalk.gray('─'.repeat(60)));
            console.log(`${chalk.cyan('ID:')} ${episode.id}`);
            console.log(`${chalk.cyan('Podcast ID:')} ${episode.podcast_id}`);
            console.log(`${chalk.cyan('Title:')} ${episode.title}`);
            console.log(`${chalk.cyan('Description:')} ${episode.description || '(none)'}`);
            console.log(`${chalk.cyan('Duration:')} ${episode.duration ? formatDuration(episode.duration) : 'Not available'}`);
            console.log(`${chalk.cyan('Status:')} ${episode.status}`);
            console.log(`${chalk.cyan('Price:')} ${episode.price_per_second} shannon/second`);
            console.log(`${chalk.cyan('Storage Path:')} ${episode.storage_path || '(none)'}`);
            console.log(`${chalk.cyan('Created:')} ${formatTimestamp(episode.created_at)}`);
            console.log(chalk.gray('─'.repeat(60)));
        }
        catch (error) {
            spinner.stop();
            handleError(error);
        }
    });
    // ============================================================================
    // Update
    // ============================================================================
    episode
        .command('update')
        .description('Update episode metadata')
        .argument('<id>', 'Episode ID')
        .option('--title <title>', 'New title')
        .option('--description <desc>', 'New description')
        .option('--price-per-second <price>', 'New price per second in shannon')
        .action(async (id, options) => {
        const spinner = ora();
        try {
            // Check if at least one field is provided
            if (!options.title && options.description === undefined && !options.pricePerSecond) {
                console.error(chalk.red('\nError: At least one field must be provided (--title, --description, or --price-per-second)'));
                process.exit(1);
            }
            const client = await createClient();
            spinner.start('Updating episode...');
            const episode = await client.updateEpisode(id, {
                title: options.title,
                description: options.description,
                price_per_second: options.pricePerSecond,
            });
            spinner.succeed('Episode updated');
            console.log();
            console.log(chalk.green('✓ Updated episode:'));
            console.log(`  ID: ${episode.id}`);
            console.log(`  Title: ${episode.title}`);
            console.log(`  Description: ${episode.description || '(none)'}`);
            console.log(`  Price: ${episode.price_per_second} shannon/s`);
        }
        catch (error) {
            spinner.stop();
            handleError(error);
        }
    });
    // ============================================================================
    // Publish
    // ============================================================================
    episode
        .command('publish')
        .description('Publish an episode (status must be "ready")')
        .argument('<id>', 'Episode ID')
        .action(async (id) => {
        const spinner = ora();
        try {
            const client = await createClient();
            spinner.start('Publishing episode...');
            const result = await client.publishEpisode(id);
            spinner.succeed('Episode published');
            console.log();
            console.log(chalk.green('✓ Published successfully:'));
            console.log(`  ID: ${result.episode.id}`);
            console.log(`  Title: ${result.episode.title}`);
            console.log(`  Status: ${result.episode.status}`);
            console.log(`  ${result.message}`);
        }
        catch (error) {
            spinner.stop();
            handleError(error);
        }
    });
    // ============================================================================
    // Unpublish
    // ============================================================================
    episode
        .command('unpublish')
        .description('Unpublish an episode')
        .argument('<id>', 'Episode ID')
        .action(async (id) => {
        const spinner = ora();
        try {
            const client = await createClient();
            spinner.start('Unpublishing episode...');
            // Use updateEpisode to change status back to 'ready'
            // Note: The backend API doesn't have a dedicated unpublish endpoint,
            // so we use the update endpoint to change the status
            const episode = await client.getEpisode(id);
            if (episode.status !== 'published') {
                spinner.fail(`Episode is not published (status: ${episode.status})`);
                process.exit(1);
            }
            // Call the backend unpublish endpoint via a PUT request
            // Since there's no direct API method, we make a custom request
            const configManager = new ConfigManager();
            const config = await configManager.load();
            const { default: axios } = await import('axios');
            await axios.post(`${config.apiUrl}/admin/episodes/${id}/unpublish`, {}, {
                headers: {
                    'Authorization': `Bearer ${config.apiToken}`,
                    'Content-Type': 'application/json',
                },
            });
            spinner.succeed('Episode unpublished');
            console.log();
            console.log(chalk.green('✓ Unpublished successfully:'));
            console.log(`  ID: ${id}`);
            console.log(`  Status: ready`);
        }
        catch (error) {
            spinner.stop();
            if (error instanceof ApiError) {
                handleError(error);
            }
            else if (axios.isAxiosError(error) && error.response?.status === 404) {
                // Endpoint doesn't exist, provide helpful message
                console.error(chalk.red('\nError: The unpublish endpoint is not available on this backend.'));
                console.error(chalk.yellow('Please update your backend to support unpublishing episodes.'));
                process.exit(1);
            }
            else {
                handleError(error);
            }
        }
    });
    // ============================================================================
    // Delete
    // ============================================================================
    episode
        .command('delete')
        .description('Delete an episode')
        .argument('<id>', 'Episode ID')
        .option('--force', 'Skip confirmation prompt')
        .option('--delete-files', 'Also delete associated files')
        .action(async (id, options) => {
        const spinner = ora();
        try {
            const client = await createClient();
            // Get episode info first
            spinner.start('Fetching episode info...');
            const episode = await client.getEpisode(id);
            spinner.stop();
            console.log();
            console.log(chalk.bold('Episode to delete:'));
            console.log(`  Title: ${episode.title}`);
            console.log(`  Status: ${episode.status}`);
            if (episode.duration) {
                console.log(`  Duration: ${formatDuration(episode.duration)}`);
            }
            console.log();
            // Confirm unless --force
            if (!options.force) {
                const { default: inquirer } = await import('inquirer');
                const { confirm } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirm',
                        message: chalk.red('Are you sure you want to delete this episode?'),
                        default: false,
                    },
                ]);
                if (!confirm) {
                    console.log(chalk.yellow('Delete cancelled.'));
                    process.exit(0);
                }
            }
            spinner.start('Deleting episode...');
            const message = await client.deleteEpisode(id);
            spinner.succeed('Episode deleted');
            console.log();
            console.log(chalk.green('✓ Deleted successfully'));
            console.log(`  ${message}`);
            if (options.deleteFiles && episode.storage_path) {
                console.log(chalk.gray('  Associated files will be cleaned up by the backend.'));
            }
        }
        catch (error) {
            spinner.stop();
            handleError(error);
        }
    });
    // ============================================================================
    // Upload
    // ============================================================================
    episode
        .command('upload')
        .description('Upload audio file for an episode')
        .argument('<id>', 'Episode ID')
        .requiredOption('--file <path>', 'Path to audio file')
        .option('--wait', 'Wait for transcoding to complete')
        .action(async (id, options) => {
        const spinner = ora();
        try {
            const client = await createClient();
            // Validate file
            spinner.start(`Validating file: ${options.file}...`);
            const validation = await validateFile(options.file);
            if (!validation.valid) {
                spinner.fail(`Invalid file: ${validation.error}`);
                process.exit(1);
            }
            spinner.succeed(`File validated: ${formatFileSize(validation.size)}`);
            // Upload file
            spinner.start('Uploading audio file...');
            const fileBuffer = await fs.readFile(options.file);
            const fileName = path.basename(options.file);
            const uploadResult = await client.uploadEpisodeAudio(id, fileBuffer, fileName, validation.mimeType);
            spinner.succeed('File uploaded');
            console.log();
            console.log(chalk.green('✓ Upload successful:'));
            console.log(`  Episode: ${uploadResult.episode.title}`);
            console.log(`  Status: ${uploadResult.episode.status}`);
            console.log(`  ${uploadResult.message}`);
            // Wait for transcoding if requested
            if (options.wait) {
                console.log();
                spinner.start('Waiting for transcoding to complete...');
                const transcodedEpisode = await client.pollTranscodingStatus(id);
                spinner.succeed(`Transcoding complete: ${formatDuration(transcodedEpisode.duration || 0)}`);
            }
        }
        catch (error) {
            spinner.stop();
            handleError(error);
        }
    });
    return episode;
}
// Import axios for unpublish
import axios from 'axios';
//# sourceMappingURL=episode.js.map