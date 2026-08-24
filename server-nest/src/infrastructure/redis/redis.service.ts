// Redis Service：基于 ioredis
// 当前主要用途：
//  1. JWT 黑名单（可选，登出时把 token 加入黑名单直至过期）
//  2. 临时缓存（用例 schema 摘要、空间成员列表等）
//  3. 简易分布式限流（防 brute-force 登录）
//
// 设计：只暴露必要方法，避免把整个 ioredis 透出去导致用法泛滥
import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly cfg: ConfigService) {}

  async onModuleInit() {
    const url = this.cfg.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.logger.log(`[Redis] connecting to ${url}`);
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    this.client.on('error', (e) => this.logger.error(`redis error: ${e.message}`));
    try {
      await this.client.connect();
      this.logger.log(`Redis connected: ${url}`);
    } catch (e: any) {
      // 启动期 redis 不可用不应该让服务直接挂掉（限流/缓存是 best-effort）
      this.logger.warn(`Redis connect failed: ${e?.message}`);
    }
  }

  async onModuleDestroy() {
    try {
      await this.client?.quit();
    } catch {
      /* ignore */
    }
  }

  get raw(): Redis {
    return this.client;
  }

  // ---- 业务封装 ----

  /**
   * 简易滑动窗口计数：用于登录等接口的限流
   * @returns true 表示触发限流
   */
  async hitRateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
    if (!this.client) return false;
    const fullKey = `rl:${key}`;
    const cur = await this.client.incr(fullKey);
    if (cur === 1) {
      await this.client.pexpire(fullKey, windowMs);
    }
    return cur > max;
  }

  async setJSON<T>(key: string, value: T, ttlSec?: number): Promise<void> {
    if (!this.client) return;
    const v = JSON.stringify(value);
    if (ttlSec) await this.client.set(key, v, 'EX', ttlSec);
    else await this.client.set(key, v);
  }

  async getJSON<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    const v = await this.client.get(key);
    if (!v) return null;
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key);
  }
}
