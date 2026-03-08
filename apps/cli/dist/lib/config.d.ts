/**
 * Configuration management for fap CLI
 * Stores config at ~/.fiber-audio-player/cli.json
 */
import { Config } from './types.js';
export declare class ConfigManager {
    private config;
    private loaded;
    /**
     * Load configuration from disk
     */
    load(): Promise<Config>;
    /**
     * Save configuration to disk with 0600 permissions
     */
    save(): Promise<void>;
    /**
     * Get a config value
     */
    get<K extends keyof Config>(key: K): Config[K];
    /**
     * Get the full config object
     */
    getAll(): Config;
    /**
     * Set a config value
     */
    set<K extends keyof Config>(key: K, value: Config[K]): void;
    /**
     * Set multiple config values
     */
    setMultiple(values: Partial<Config>): void;
    /**
     * Validate the current configuration
     */
    validate(): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Check if config is valid
     */
    isValid(): boolean;
    /**
     * Get the config file path
     */
    getConfigPath(): string;
    /**
     * Check if config file exists
     */
    exists(): Promise<boolean>;
    /**
     * Reset to default configuration
     */
    reset(): Promise<void>;
    /**
     * Ensure config has been loaded
     */
    private ensureLoaded;
}
export declare const config: ConfigManager;
//# sourceMappingURL=config.d.ts.map