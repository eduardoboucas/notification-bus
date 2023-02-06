import { createHash } from "crypto";
import { join } from "path";
import { arch, platform, version as rawNodeVersion } from "process";

import envPaths from "env-paths";
import got from "got";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import ms from "ms";
import semver from "semver";

import { APIResponse, Item } from "../lib/api.js";
import { render as defaultRenderer } from "./render.js";

interface CacheFile {
  items: LocalItem[];
  fetch_timestamp: number;
  expiry_timestamp?: number;
}

export interface LocalItem extends Item {
  id: string;
  last_rendered?: number;
}

type Renderer = (items: LocalItem[]) => void;

interface NotificationBusOptions {
  cachePath?: string;
  fetchInterval?: number;
  name: string;
  renderer?: Renderer;
  url: string;
  version: string;
}

// 30 minutes
const DEFAULT_FETCH_INTERVAL = 18e5;

export class NotificationBus {
  db: Low<CacheFile>;
  dbLoader: Promise<Low<CacheFile>>;
  cachePath: string;
  fetchInterval: number;
  name: string;
  renderer: Renderer;
  url: string;
  version: string;

  constructor({
    cachePath,
    fetchInterval,
    name,
    renderer,
    url,
    version,
  }: NotificationBusOptions) {
    this.cachePath = cachePath ?? NotificationBus.defaultCachePath(name);
    this.fetchInterval = fetchInterval ?? DEFAULT_FETCH_INTERVAL;
    this.name = name;
    this.renderer = renderer ?? defaultRenderer;
    this.url = url;
    this.version = version;

    const adapter = new JSONFile<CacheFile>(this.cachePath);

    this.db = new Low(adapter);
    this.dbLoader = this.initializeDB();
  }

  private static defaultCachePath(name: string) {
    const cacheDirectory = envPaths(`${name}-notification-bus`).cache;

    return join(cacheDirectory, "cache.json");
  }

  private async fetchRemote() {
    const endpoint = `${this.url}/${this.version}`;
    const response = (await got.get(endpoint).json()) as APIResponse;
    const items = response.items.map(this.getLocalItem);

    return { ...response, items };
  }

  private async fetchRemoteAndMergeWithCache(cache: CacheFile) {
    const cachedItems = new Map(cache.items.map((item) => [item.id, item]));

    try {
      const response = await this.fetchRemote();
      const items = response.items.map((item) => {
        const cachedItem = cachedItems.get(item.id);

        if (cachedItem !== undefined) {
          return {
            ...item,
            last_rendered: cachedItem.last_rendered,
          };
        }

        return item;
      });

      const newCache = {
        ...cache,
        items,
        fetch_timestamp: Date.now(),
      } as CacheFile;

      return newCache;
    } catch {
      // no-op
    }

    return cache;
  }

  private filterItems(
    allItems: LocalItem[],
    maxItems: number,
    inputs: Set<string>
  ) {
    const nodeVersion = rawNodeVersion.slice(1);
    const items = allItems.filter((item) => {
      if (item.arch !== undefined && !item.arch.includes(arch)) {
        return false;
      }

      if (item.platform !== undefined && !item.platform.includes(platform)) {
        return false;
      }

      if (
        item.min_node_version !== undefined &&
        semver.lt(nodeVersion, item.min_node_version)
      ) {
        return false;
      }

      if (
        item.max_node_version !== undefined &&
        semver.gt(nodeVersion, item.max_node_version)
      ) {
        return false;
      }

      if (
        Array.isArray(item.inputs) &&
        !item.inputs.some((input) => inputs.has(input))
      ) {
        return false;
      }

      return true;
    });
    const sortedItems = items.sort((a, b) => a.severity - b.severity);

    return sortedItems.slice(0, maxItems);
  }

  private getLocalItem(item: Item): LocalItem {
    const fingerprint = JSON.stringify({
      text: item.body,
      type: item.severity,
    });
    const id = createHash("sha1").update(fingerprint).digest("hex");
    const displaInterval =
      item.display_interval === undefined
        ? 0
        : ms(item.display_interval.toString());

    return {
      last_rendered: 0,
      ...item,
      id,
      display_interval: displaInterval,
    };
  }

  private async initializeDB() {
    await this.db.read();

    if (this.db.data === null) {
      this.db.data = {
        items: [],
        fetch_timestamp: 0,
      };
    }

    const age = Date.now() - this.db.data.fetch_timestamp;

    if (age > this.fetchInterval) {
      this.db.data = await this.fetchRemoteAndMergeWithCache(this.db.data);
    }

    return this.db;
  }

  private async markAsRendered(ids: string[]) {
    const timestamp = Date.now();

    await this.updateItems((item: LocalItem) => {
      if (!ids.includes(item.id)) {
        return item;
      }

      return {
        ...item,
        last_rendered: timestamp,
      };
    });
  }

  private shouldRenderItem(item: LocalItem) {
    if (!item.last_rendered) {
      return true;
    }

    const age = Date.now() - item.last_rendered;

    return age > item.display_interval;
  }

  private async updateItems(
    callback: (item: LocalItem) => LocalItem,
    updateFetchTimestamp = false
  ) {
    await this.dbLoader;

    const data = this.db.data as NonNullable<CacheFile>;
    const newItems = data.items.map(callback);

    if (updateFetchTimestamp) {
      data.fetch_timestamp = Date.now();
    }

    const newCache = { ...data, items: newItems } as CacheFile;

    await this.writeCache(newCache);

    return newCache;
  }

  private async writeCache(cache: CacheFile) {
    try {
      await this.dbLoader;

      this.db.data = cache;

      await this.db.write();
    } catch (err) {
      console.error(err);
      // no-op
    }
  }

  async getItems({
    inputs = new Set(),
    markAsRendered = false,
  }: {
    inputs?: Set<string>;
    markAsRendered?: boolean;
  }) {
    await this.dbLoader;

    const cache = this.db.data as NonNullable<CacheFile>;
    const filteredItems = this.filterItems(cache.items, Infinity, inputs);

    if (markAsRendered) {
      await this.markAsRendered(filteredItems.map((item) => item.id));
    }

    return filteredItems;
  }

  async render({
    maxItems = Infinity,
    inputs = new Set(),
  }: { maxItems?: number; inputs?: Set<string> } = {}) {
    await this.dbLoader;

    const cache = this.db.data as NonNullable<CacheFile>;
    const filteredItems = this.filterItems(
      cache.items,
      maxItems,
      inputs
    ).filter(this.shouldRenderItem);

    await this.renderer(filteredItems);
    await this.markAsRendered(filteredItems.map((item) => item.id));
  }
}
