/**
 * Configuration management for fap CLI
 * Stores config at ~/.fiber-audio-player/cli.json
 */
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { ConfigError } from './types.js';
const CONFIG_DIR = path.join(os.homedir(), '.fiber-audio-player');
const CONFIG_FILE = path.join(CONFIG_DIR, 'cli.json');
const DEFAULT_CONFIG = {
    apiUrl: 'http://localhost:8787',
    apiToken: '',
};
export class ConfigManager {
    config = { ...DEFAULT_CONFIG };
    loaded = false;
    /**
     * Load configuration from disk
     */
    async load() {
        try {
            const data = await fs.readFile(CONFIG_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            this.config = {
                apiUrl: parsed.apiUrl ?? DEFAULT_CONFIG.apiUrl,
                apiToken: parsed.apiToken ?? DEFAULT_CONFIG.apiToken,
            };
            this.loaded = true;
            return this.config;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                // Config file doesn't exist, use defaults
                this.config = { ...DEFAULT_CONFIG };
                this.loaded = true;
                return this.config;
            }
            if (error instanceof SyntaxError) {
                throw new ConfigError('Invalid JSON in config file');
            }
            throw new ConfigError(`Failed to load config: ${error.message}`);
        }
    }
    /**
     * Save configuration to disk with 0600 permissions
     */
    async save() {
        try {
            // Ensure config directory exists
            await fs.mkdir(CONFIG_DIR, { recursive: true });
            // Write config with restricted permissions (owner read/write only)
            await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2), { mode: 0o600 });
        }
        catch (error) {
            throw new ConfigError(`Failed to save config: ${error.message}`);
        }
    }
    /**
     * Get a config value
     */
    get(key) {
        this.ensureLoaded();
        return this.config[key];
    }
    /**
     * Get the full config object
     */
    getAll() {
        this.ensureLoaded();
        return { ...this.config };
    }
    /**
     * Set a config value
     */
    set(key, value) {
        this.ensureLoaded();
        this.config[key] = value;
    }
    /**
     * Set multiple config values
     */
    setMultiple(values) {
        this.ensureLoaded();
        this.config = { ...this.config, ...values };
    }
    /**
     * Validate the current configuration
     */
    validate() {
        const errors = [];
        if (!this.loaded) {
            errors.push('Config not loaded');
            return { valid: false, errors };
        }
        // Validate API URL
        if (!this.config.apiUrl) {
            errors.push('apiUrl is required');
        }
        else {
            try {
                const url = new URL(this.config.apiUrl);
                if (!['http:', 'https:'].includes(url.protocol)) {
                    errors.push('apiUrl must use http or https protocol');
                }
            }
            catch {
                errors.push('apiUrl must be a valid URL');
            }
        }
        // Validate API Token
        if (!this.config.apiToken) {
            errors.push('apiToken is required for admin operations');
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
    /**
     * Check if config is valid
     */
    isValid() {
        return this.validate().valid;
    }
    /**
     * Get the config file path
     */
    getConfigPath() {
        return CONFIG_FILE;
    }
    /**
     * Check if config file exists
     */
    async exists() {
        try {
            await fs.access(CONFIG_FILE);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Reset to default configuration
     */
    async reset() {
        this.config = { ...DEFAULT_CONFIG };
        await this.save();
    }
    /**
     * Ensure config has been loaded
     */
    ensureLoaded() {
        if (!this.loaded) {
            throw new ConfigError('Config not loaded. Call load() first.');
        }
    }
}
// Export singleton instance
export const config = new ConfigManager();
//# sourceMappingURL=config.js.map