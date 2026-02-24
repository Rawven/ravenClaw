/**
 * Lazy Module Loader
 * Enables lazy loading of modules on first use to reduce startup memory
 */

import fs from "node:fs/promises";
import path from "node:path";

type ModuleCache = Map<string, unknown>;

/**
 * Lazy loader for modules
 * Modules are only loaded when first accessed
 */
export class LazyLoader {
  private cache: ModuleCache = new Map();
  private moduleDir: string;

  constructor(moduleDir: string) {
    this.moduleDir = moduleDir;
  }

  /**
   * Load a module lazily on first access
   */
  async load<T>(modulePath: string): Promise<T> {
    const fullPath = path.join(this.moduleDir, modulePath);

    if (this.cache.has(fullPath)) {
      return this.cache.get(fullPath) as T;
    }

    // Dynamic import
    const module = await import(fullPath);
    this.cache.set(fullPath, module);
    return module as T;
  }

  /**
   * Check if a module is loaded
   */
  isLoaded(modulePath: string): boolean {
    const fullPath = path.join(this.moduleDir, modulePath);
    return this.cache.has(fullPath);
  }

  /**
   * Clear cache for a specific module
   */
  unload(modulePath: string): void {
    const fullPath = path.join(this.moduleDir, modulePath);
    this.cache.delete(fullPath);
  }

  /**
   * Clear all cached modules
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get memory usage estimate (bytes)
   */
  getMemoryUsage(): number {
    // Rough estimate: 1MB per cached module
    return this.cache.size * 1024 * 1024;
  }
}

/**
 * Lazy Channel Loader
 * Loads channel plugins only when needed
 */
export class LazyChannelLoader {
  private loadedChannels: Set<string> = new Set();
  private channelDir: string;

  constructor(channelDir: string) {
    this.channelDir = channelDir;
  }

  /**
   * Load a specific channel plugin
   */
  async loadChannel(channelId: string): Promise<unknown> {
    if (this.loadedChannels.has(channelId)) {
      return;
    }

    const channelPath = path.join(this.channelDir, channelId);

    try {
      await fs.access(channelPath);
      const channelModule = await import(channelPath);
      this.loadedChannels.add(channelId);
      return channelModule;
    } catch {
      throw new Error(`Channel not found: ${channelId}`);
    }
  }

  /**
   * Check if a channel is loaded
   */
  isLoaded(channelId: string): boolean {
    return this.loadedChannels.has(channelId);
  }

  /**
   * Get list of loaded channels
   */
  getLoadedChannels(): string[] {
    return [...this.loadedChannels];
  }

  /**
   * Unload a channel to free memory
   */
  async unloadChannel(channelId: string): Promise<void> {
    this.loadedChannels.delete(channelId);
  }

  /**
   * Get estimated memory savings
   */
  getMemorySavings(totalChannels: number): number {
    // Assume each channel uses ~10MB when loaded
    const unloadedCount = totalChannels - this.loadedChannels.size;
    return unloadedCount * 10 * 1024 * 1024;
  }
}
