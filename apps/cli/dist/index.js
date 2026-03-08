#!/usr/bin/env node
import { Command } from 'commander';
import { createAuthCommands } from './commands/auth.js';
import { createPodcastCommands } from './commands/podcast.js';
import { createEpisodeCommands } from './commands/episode.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
const program = new Command('fap');
program
    .description('CLI for managing Fiber Audio Player content')
    .version(packageJson.version);
program.addCommand(createAuthCommands());
program.addCommand(createPodcastCommands());
program.addCommand(createEpisodeCommands());
program.parse();
//# sourceMappingURL=index.js.map