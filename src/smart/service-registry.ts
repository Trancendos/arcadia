/**
 * Arcadian Exchange — Smart Adaptive Intelligent Services
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 *
 * Zero-cost model: No external dependencies (Redis, Consul, etc.)
 * Everything runs in-process with intelligent resource management.
 *
 * Features:
 *   - Adaptive service discovery & registration
 *   - Intelligent self-healing health monitor
 *   - Resource optimization with smart caching
 *   - Nanoservice extraction manifests
 *   - Future-proof technology adapter
 *   - Predictive scaling signals
 *   - Zero-cost in-memory state with LRU eviction
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';
import { generateId, nowISO } from '../utils/helpers';

// ── Types ─────────────────────────────────────────────────────────────

export type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy' | 'starting' | 'stopped';
export type NanoserviceTarget = 'lambda' | 'cloudflare_worker' | 'deno_deploy' | 'edge_function' | 'wasm' | 'container';

export interface ServiceNode {
  id: string;
  name: string;
  version: string;
  status: ServiceStatus;
  endpoint: string;
  healthCheckUrl: string;
  lastHealthCheck: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  responseTimeMs: number[];          // Rolling window of 100 samples
  avgResponseTimeMs: number;
  p99ResponseTimeMs: number;
  uptime: number;                    // seconds
  startedAt: string;
  metadata: Record<string, string>;
  capabilities: string[];
}

export interface HealthRule {
  id: string;
  serviceName: string;
  metric: 'responseTime' | 'errorRate' | 'memoryUsage' | 'cpuUsage' | 'consecutiveFailures';
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  action: 'restart' | 'alert' | 'scale_up' | 'scale_down' | 'circuit_break' | 'failover';
  cooldownMs: number;
  lastTriggered?: string;
  triggerCount: number;
  isActive: boolean;
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
  sizeBytes: number;
}

export interface NanoserviceManifest {
  id: string;
  name: string;
  sourceModule: string;
  entryFunction: string;
  description: string;
  target: NanoserviceTarget;
  estimatedColdStartMs: number;
  estimatedMemoryMB: number;
  triggers: string[];
  dependencies: string[];
  env: Record<string, string>;
  scaling: {
    minInstances: number;
    maxInstances: number;
    concurrency: number;
    timeoutMs: number;
  };
}

export interface ResourceMetrics {
  timestamp: string;
  memoryUsedMB: number;
  memoryTotalMB: number;
  memoryPercent: number;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  cpuUser: number;
  cpuSystem: number;
  eventLoopDelayMs: number;
  activeHandles: number;
  activeRequests: number;
  cacheHitRate: number;
  cacheEntries: number;
  cacheSizeMB: number;
}

export interface ScalingSignal {
  timestamp: string;
  direction: 'scale_up' | 'scale_down' | 'stable';
  confidence: number;
  reason: string;
  metrics: {
    rps: number;
    avgLatency: number;
    errorRate: number;
    memoryPercent: number;
  };
  recommendation: string;
}

export interface TechAdapterStatus {
  currentStack: Record<string, string>;
  migrationPath: Record<string, { current: string; target2030: string; target2040: string; target2060: string }>;
  readinessScore: number;
  recommendations: string[];
}

// ── Smart LRU Cache ───────────────────────────────────────────────────

class SmartCache {
  private store: Map<string, CacheEntry> = new Map();
  private readonly maxEntries: number;
  private readonly maxSizeMB: number;
  private currentSizeBytes = 0;
  private hits = 0;
  private misses = 0;

  constructor(maxEntries = 10000, maxSizeMB = 50) {
    this.maxEntries = maxEntries;
    this.maxSizeMB = maxSizeMB;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) { this.misses++; return undefined; }
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.misses++;
      return undefined;
    }
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = 60000): void {
    const sizeBytes = JSON.stringify(value).length * 2; // rough estimate
    this.evictIfNeeded(sizeBytes);

    if (this.store.has(key)) {
      const old = this.store.get(key)!;
      this.currentSizeBytes -= old.sizeBytes;
    }

    this.store.set(key, {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      accessCount: 0,
      lastAccessed: Date.now(),
      sizeBytes,
    });
    this.currentSizeBytes += sizeBytes;
  }

  delete(key: string): boolean {
    const entry = this.store.get(key);
    if (entry) {
      this.currentSizeBytes -= entry.sizeBytes;
      return this.store.delete(key);
    }
    return false;
  }

  private evictIfNeeded(incomingBytes: number): void {
    // Evict expired first
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.delete(key);
    }

    // Evict LRU if still over limits
    while (
      (this.store.size >= this.maxEntries ||
       this.currentSizeBytes + incomingBytes > this.maxSizeMB * 1024 * 1024) &&
      this.store.size > 0
    ) {
      let lruKey = '';
      let lruTime = Infinity;
      for (const [key, entry] of this.store) {
        if (entry.lastAccessed < lruTime) {
          lruTime = entry.lastAccessed;
          lruKey = key;
        }
      }
      if (lruKey) this.delete(lruKey);
      else break;
    }
  }

  clear(): void {
    this.store.clear();
    this.currentSizeBytes = 0;
  }

  getStats() {
    return {
      entries: this.store.size,
      maxEntries: this.maxEntries,
      sizeMB: Math.round(this.currentSizeBytes / 1024 / 1024 * 100) / 100,
      maxSizeMB: this.maxSizeMB,
      hitRate: this.hits + this.misses > 0 ? Math.round(this.hits / (this.hits + this.misses) * 10000) / 100 : 0,
      hits: this.hits,
      misses: this.misses,
    };
  }
}

// ── Service Registry ──────────────────────────────────────────────────

export class SmartServiceRegistry {
  private static instance: SmartServiceRegistry;
  private services: Map<string, ServiceNode> = new Map();
  private healthRules: Map<string, HealthRule> = new Map();
  private readonly cache: SmartCache;
  private nanoManifests: Map<string, NanoserviceManifest> = new Map();
  private metricsHistory: ResourceMetrics[] = [];
  private scalingHistory: ScalingSignal[] = [];
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private metricsInterval: ReturnType<typeof setInterval> | null = null;
  private readonly startTime = Date.now();

  private constructor() {
    this.cache = new SmartCache(10000, 50);
    this.seedNanoManifests();
    this.seedHealthRules();
    this.startHealthMonitor();
    this.startMetricsCollector();
    logger.info('SmartServiceRegistry initialised — adaptive intelligent services active');
  }

  static getInstance(): SmartServiceRegistry {
    if (!SmartServiceRegistry.instance) {
      SmartServiceRegistry.instance = new SmartServiceRegistry();
    }
    return SmartServiceRegistry.instance;
  }

  // ── Service Discovery ─────────────────────────────────────────────

  register(params: {
    name: string;
    version: string;
    endpoint: string;
    healthCheckUrl?: string;
    capabilities?: string[];
    metadata?: Record<string, string>;
  }): ServiceNode {
    const node: ServiceNode = {
      id: generateId('svc'),
      name: params.name,
      version: params.version,
      status: 'starting',
      endpoint: params.endpoint,
      healthCheckUrl: params.healthCheckUrl || `${params.endpoint}/health`,
      lastHealthCheck: nowISO(),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      responseTimeMs: [],
      avgResponseTimeMs: 0,
      p99ResponseTimeMs: 0,
      uptime: 0,
      startedAt: nowISO(),
      metadata: params.metadata || {},
      capabilities: params.capabilities || [],
    };

    this.services.set(node.id, node);
    logger.info({ serviceId: node.id, name: params.name, endpoint: params.endpoint }, 'Service registered');
    return node;
  }

  deregister(serviceId: string): void {
    const svc = this.services.get(serviceId);
    if (svc) {
      svc.status = 'stopped';
      this.services.delete(serviceId);
      logger.info({ serviceId, name: svc.name }, 'Service deregistered');
    }
  }

  discover(nameOrCapability: string): ServiceNode[] {
    // Check cache first
    const cacheKey = `discover:${nameOrCapability}`;
    const cached = this.cache.get<ServiceNode[]>(cacheKey);
    if (cached) return cached;

    const results = Array.from(this.services.values()).filter(
      s => s.status === 'healthy' && (
        s.name === nameOrCapability ||
        s.capabilities.includes(nameOrCapability)
      )
    );

    this.cache.set(cacheKey, results, 5000); // 5s TTL
    return results;
  }

  getService(serviceId: string): ServiceNode | undefined {
    return this.services.get(serviceId);
  }

  listServices(): ServiceNode[] {
    return Array.from(this.services.values());
  }

  recordResponseTime(serviceId: string, latencyMs: number): void {
    const svc = this.services.get(serviceId);
    if (!svc) return;
    svc.responseTimeMs.push(latencyMs);
    if (svc.responseTimeMs.length > 100) svc.responseTimeMs.shift();
    svc.avgResponseTimeMs = Math.round(
      svc.responseTimeMs.reduce((a, b) => a + b, 0) / svc.responseTimeMs.length
    );
    const sorted = [...svc.responseTimeMs].sort((a, b) => a - b);
    svc.p99ResponseTimeMs = sorted[Math.ceil(sorted.length * 0.99) - 1] || 0;
  }

  // ── Self-Healing Health Monitor ───────────────────────────────────

  private startHealthMonitor(): void {
    this.healthCheckInterval = setInterval(() => {
      this.runHealthChecks();
    }, 30000); // every 30s
  }

  private runHealthChecks(): void {
    for (const svc of this.services.values()) {
      // Simulate health check (in production, make HTTP call to healthCheckUrl)
      const isHealthy = svc.consecutiveFailures < 3;

      if (isHealthy) {
        svc.consecutiveSuccesses++;
        svc.consecutiveFailures = 0;
        if (svc.status !== 'healthy' && svc.consecutiveSuccesses >= 2) {
          svc.status = 'healthy';
          logger.info({ serviceId: svc.id, name: svc.name }, 'Service recovered — status: healthy');
        }
      } else {
        svc.consecutiveFailures++;
        svc.consecutiveSuccesses = 0;
        if (svc.consecutiveFailures >= 3) {
          svc.status = 'unhealthy';
          this.triggerSelfHealing(svc);
        } else if (svc.consecutiveFailures >= 1) {
          svc.status = 'degraded';
        }
      }

      svc.lastHealthCheck = nowISO();
      svc.uptime = Math.floor((Date.now() - new Date(svc.startedAt).getTime()) / 1000);

      // Evaluate health rules
      this.evaluateHealthRules(svc);
    }
  }

  private triggerSelfHealing(svc: ServiceNode): void {
    logger.warn({ serviceId: svc.id, name: svc.name, failures: svc.consecutiveFailures },
      'Self-healing triggered — attempting recovery');

    // Reset failure count to allow recovery
    svc.consecutiveFailures = 0;
    svc.status = 'starting';

    // In production: restart container, re-route traffic, notify ops
    setTimeout(() => {
      svc.status = 'healthy';
      svc.consecutiveSuccesses = 1;
      logger.info({ serviceId: svc.id, name: svc.name }, 'Self-healing complete — service recovered');
    }, 5000);
  }

  // ── Health Rules Engine ───────────────────────────────────────────

  addHealthRule(rule: Omit<HealthRule, 'id' | 'triggerCount' | 'isActive'>): HealthRule {
    const full: HealthRule = {
      ...rule,
      id: generateId('hrl'),
      triggerCount: 0,
      isActive: true,
    };
    this.healthRules.set(full.id, full);
    return full;
  }

  private evaluateHealthRules(svc: ServiceNode): void {
    for (const rule of this.healthRules.values()) {
      if (!rule.isActive || rule.serviceName !== svc.name) continue;
      if (rule.lastTriggered) {
        const cooldown = new Date(rule.lastTriggered).getTime() + rule.cooldownMs;
        if (Date.now() < cooldown) continue;
      }

      let value: number;
      switch (rule.metric) {
        case 'responseTime': value = svc.avgResponseTimeMs; break;
        case 'consecutiveFailures': value = svc.consecutiveFailures; break;
        case 'memoryUsage': value = process.memoryUsage().heapUsed / 1024 / 1024; break;
        default: continue;
      }

      let triggered = false;
      switch (rule.operator) {
        case 'gt': triggered = value > rule.threshold; break;
        case 'lt': triggered = value < rule.threshold; break;
        case 'gte': triggered = value >= rule.threshold; break;
        case 'lte': triggered = value <= rule.threshold; break;
        case 'eq': triggered = value === rule.threshold; break;
      }

      if (triggered) {
        rule.triggerCount++;
        rule.lastTriggered = nowISO();
        logger.warn({
          ruleId: rule.id, service: svc.name, metric: rule.metric,
          value, threshold: rule.threshold, action: rule.action,
        }, `Health rule triggered: ${rule.action}`);
      }
    }
  }

  listHealthRules(): HealthRule[] {
    return Array.from(this.healthRules.values());
  }

  // ── Resource Metrics & Optimization ───────────────────────────────

  private startMetricsCollector(): void {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 15000); // every 15s
  }

  private collectMetrics(): void {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const cacheStats = this.cache.getStats();

    const metrics: ResourceMetrics = {
      timestamp: nowISO(),
      memoryUsedMB: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
      memoryTotalMB: Math.round(require('os').totalmem() / 1024 / 1024),
      memoryPercent: Math.round(mem.rss / require('os').totalmem() * 10000) / 100,
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
      externalMB: Math.round(mem.external / 1024 / 1024 * 100) / 100,
      cpuUser: cpu.user,
      cpuSystem: cpu.system,
      eventLoopDelayMs: 0, // Would use perf_hooks in production
      activeHandles: (process as any)._getActiveHandles?.().length || 0,
      activeRequests: (process as any)._getActiveRequests?.().length || 0,
      cacheHitRate: cacheStats.hitRate,
      cacheEntries: cacheStats.entries,
      cacheSizeMB: cacheStats.sizeMB,
    };

    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > 1000) this.metricsHistory = this.metricsHistory.slice(-1000);

    // Generate scaling signal
    this.generateScalingSignal(metrics);
  }

  private generateScalingSignal(metrics: ResourceMetrics): void {
    let direction: ScalingSignal['direction'] = 'stable';
    let confidence = 0;
    let reason = 'All metrics within normal range';
    let recommendation = 'No action needed';

    if (metrics.memoryPercent > 80) {
      direction = 'scale_up';
      confidence = 0.8;
      reason = `Memory usage at ${metrics.memoryPercent}%`;
      recommendation = 'Add instance or increase memory allocation';
    } else if (metrics.memoryPercent < 20 && this.metricsHistory.length > 10) {
      direction = 'scale_down';
      confidence = 0.6;
      reason = `Memory usage at ${metrics.memoryPercent}% — underutilized`;
      recommendation = 'Consider reducing instance size for cost optimization';
    }

    const signal: ScalingSignal = {
      timestamp: nowISO(),
      direction,
      confidence,
      reason,
      metrics: {
        rps: 0,
        avgLatency: 0,
        errorRate: 0,
        memoryPercent: metrics.memoryPercent,
      },
      recommendation,
    };

    this.scalingHistory.push(signal);
    if (this.scalingHistory.length > 200) this.scalingHistory = this.scalingHistory.slice(-200);
  }

  getResourceMetrics(limit = 60): ResourceMetrics[] {
    return this.metricsHistory.slice(-limit);
  }

  getLatestMetrics(): ResourceMetrics | undefined {
    return this.metricsHistory[this.metricsHistory.length - 1];
  }

  getScalingSignals(limit = 20): ScalingSignal[] {
    return this.scalingHistory.slice(-limit);
  }

  // ── Smart Cache Access ────────────────────────────────────────────

  cacheGet<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  cacheSet<T>(key: string, value: T, ttlMs?: number): void {
    this.cache.set(key, value, ttlMs);
  }

  cacheInvalidate(key: string): void {
    this.cache.delete(key);
  }

  cacheClear(): void {
    this.cache.clear();
  }

  getCacheStats() {
    return this.cache.getStats();
  }

  // ── Nanoservice Manifests ─────────────────────────────────────────

  getNanoManifests(): NanoserviceManifest[] {
    return Array.from(this.nanoManifests.values());
  }

  getNanoManifest(id: string): NanoserviceManifest | undefined {
    return this.nanoManifests.get(id);
  }

  // ── Future-Proof Technology Adapter ───────────────────────────────

  getTechAdapterStatus(): TechAdapterStatus {
    return {
      currentStack: {
        runtime: `Node.js ${process.version}`,
        language: 'TypeScript 5.3',
        framework: 'Express 4.x',
        realtime: 'WebSocket (ws)',
        auth: 'JWT HS512',
        encryption: 'AES-256-GCM',
        hashing: 'SHA-512',
        logging: 'Pino (structured JSON)',
        container: 'Docker (multi-stage)',
        orchestration: 'docker-compose',
      },
      migrationPath: {
        cryptography: {
          current: 'HMAC-SHA512 + AES-256-GCM',
          target2030: 'ML-KEM (CRYSTALS-Kyber) + AES-256-GCM',
          target2040: 'Hybrid PQC (ML-KEM + X25519) + ASCON',
          target2060: 'SLH-DSA (SPHINCS+) + full PQC stack',
        },
        authentication: {
          current: 'JWT HS512 (HMAC)',
          target2030: 'JWT with ML-DSA (CRYSTALS-Dilithium)',
          target2040: 'Decentralised Identity (DID) + Verifiable Credentials',
          target2060: 'Neural biometric + quantum-resistant DID',
        },
        consensus: {
          current: 'Centralised (single instance)',
          target2030: 'BFT consensus (multi-region)',
          target2040: 'DAG-based consensus (IOTA/Hedera style)',
          target2060: 'Quantum-enhanced consensus (QKD network)',
        },
        storage: {
          current: 'In-memory (development)',
          target2030: 'PostgreSQL + Redis + S3',
          target2040: 'Distributed ledger + IPFS + TimescaleDB',
          target2060: 'Holographic storage + quantum memory',
        },
        networking: {
          current: 'HTTP/1.1 + WebSocket',
          target2030: 'HTTP/3 (QUIC) + gRPC',
          target2040: 'Service mesh (Envoy/Istio) + GraphQL federation',
          target2060: 'Quantum internet protocol + neural mesh',
        },
        computation: {
          current: 'Node.js V8 (JIT)',
          target2030: 'WebAssembly + native modules',
          target2040: 'Edge compute + WASM micro-VMs',
          target2060: 'Quantum compute hybrid + neuromorphic processors',
        },
      },
      readinessScore: this.calculateReadinessScore(),
      recommendations: [
        'Implement database persistence layer (PostgreSQL + Redis) for production',
        'Add OpenTelemetry for distributed tracing across nanoservices',
        'Prepare ML-KEM migration module for post-quantum cryptography (2027-2030)',
        'Implement event sourcing with append-only log for audit compliance',
        'Add gRPC interfaces alongside REST for inter-service communication',
        'Create WebAssembly builds of compute-heavy engines (analytics, agents)',
        'Implement circuit breaker patterns at engine-to-engine boundaries',
        'Add Prometheus metrics endpoint for observability stack integration',
      ],
    };
  }

  private calculateReadinessScore(): number {
    let score = 0;
    const checks = [
      [true, 10],   // TypeScript strict mode
      [true, 10],   // Modular engine architecture
      [true, 10],   // Event-driven (SmartEventBus)
      [true, 8],    // Circuit breaker pattern
      [true, 8],    // Adaptive rate limiting
      [true, 7],    // IAM with role levels
      [true, 7],    // AES-256-GCM encryption
      [true, 5],    // Docker containerised
      [true, 5],    // Graceful shutdown
      [false, 10],  // Persistent storage (not yet)
      [false, 8],   // gRPC interfaces (not yet)
      [false, 7],   // OpenTelemetry (not yet)
      [false, 5],   // WASM builds (not yet)
    ] as const;

    const maxScore = checks.reduce((s, [_, w]) => s + w, 0);
    score = checks.reduce((s, [pass, w]) => s + (pass ? w : 0), 0);
    return Math.round(score / maxScore * 100);
  }

  // ── Dashboard Summary ─────────────────────────────────────────────

  getDashboardSummary() {
    const latestMetrics = this.getLatestMetrics();
    const latestScaling = this.scalingHistory[this.scalingHistory.length - 1];
    const cacheStats = this.cache.getStats();

    return {
      services: {
        total: this.services.size,
        healthy: Array.from(this.services.values()).filter(s => s.status === 'healthy').length,
        degraded: Array.from(this.services.values()).filter(s => s.status === 'degraded').length,
        unhealthy: Array.from(this.services.values()).filter(s => s.status === 'unhealthy').length,
      },
      healthRules: {
        total: this.healthRules.size,
        active: Array.from(this.healthRules.values()).filter(r => r.isActive).length,
        triggered: Array.from(this.healthRules.values()).reduce((s, r) => s + r.triggerCount, 0),
      },
      cache: cacheStats,
      resources: latestMetrics ? {
        memoryMB: latestMetrics.memoryUsedMB,
        memoryPercent: latestMetrics.memoryPercent,
        heapMB: latestMetrics.heapUsedMB,
        cacheHitRate: latestMetrics.cacheHitRate,
      } : null,
      scaling: latestScaling ? {
        direction: latestScaling.direction,
        confidence: latestScaling.confidence,
        recommendation: latestScaling.recommendation,
      } : null,
      nanoservices: {
        manifests: this.nanoManifests.size,
        extractable: Array.from(this.nanoManifests.values()).length,
      },
      futureProof: {
        readinessScore: this.calculateReadinessScore(),
        cryptoMigration: 'hmac_sha512 → ml_kem → hybrid_pqc → slh_dsa',
      },
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  shutdown(): void {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.metricsInterval) clearInterval(this.metricsInterval);
    this.cache.clear();
    logger.info('SmartServiceRegistry shut down');
  }

  // ── Seed Data ─────────────────────────────────────────────────────

  private seedNanoManifests(): void {
    const manifests: Array<Omit<NanoserviceManifest, 'id'>> = [
      {
        name: 'trading-order-processor',
        sourceModule: 'src/trading/trading-engine.ts',
        entryFunction: 'placeOrder',
        description: 'Processes individual trade orders — can run as serverless function',
        target: 'lambda',
        estimatedColdStartMs: 150,
        estimatedMemoryMB: 128,
        triggers: ['api:POST /api/v1/trading/orders', 'event:order.placed'],
        dependencies: ['utils/helpers', 'utils/logger'],
        env: { NODE_ENV: 'production' },
        scaling: { minInstances: 1, maxInstances: 100, concurrency: 10, timeoutMs: 10000 },
      },
      {
        name: 'defi-swap-executor',
        sourceModule: 'src/crypto/defi-engine.ts',
        entryFunction: 'executeSwap',
        description: 'Executes DeFi token swaps — stateless, ideal for edge deployment',
        target: 'cloudflare_worker',
        estimatedColdStartMs: 50,
        estimatedMemoryMB: 64,
        triggers: ['api:POST /api/v1/defi/swap', 'event:swap.requested'],
        dependencies: ['utils/helpers', 'utils/logger'],
        env: { NODE_ENV: 'production' },
        scaling: { minInstances: 0, maxInstances: 500, concurrency: 50, timeoutMs: 5000 },
      },
      {
        name: 'nft-minter',
        sourceModule: 'src/nft/nft-engine.ts',
        entryFunction: 'mint',
        description: 'Mints NFTs — compute-bound, benefits from dedicated instances',
        target: 'container',
        estimatedColdStartMs: 500,
        estimatedMemoryMB: 256,
        triggers: ['api:POST /api/v1/nft/mint', 'event:nft.mint_requested'],
        dependencies: ['utils/helpers', 'utils/logger'],
        env: { NODE_ENV: 'production' },
        scaling: { minInstances: 1, maxInstances: 20, concurrency: 5, timeoutMs: 30000 },
      },
      {
        name: 'compliance-kyc-processor',
        sourceModule: 'src/compliance/compliance-engine.ts',
        entryFunction: 'submitKYC',
        description: 'Processes KYC submissions — sensitive, requires isolated execution',
        target: 'lambda',
        estimatedColdStartMs: 200,
        estimatedMemoryMB: 256,
        triggers: ['api:POST /api/v1/compliance/kyc', 'event:kyc.submitted'],
        dependencies: ['utils/helpers', 'utils/logger'],
        env: { NODE_ENV: 'production', COMPLIANCE_MODE: 'strict' },
        scaling: { minInstances: 1, maxInstances: 50, concurrency: 5, timeoutMs: 30000 },
      },
      {
        name: 'agent-trade-executor',
        sourceModule: 'src/agents/agent-engine.ts',
        entryFunction: 'executeTrade',
        description: 'AI agent trade execution — long-running, needs persistent state',
        target: 'container',
        estimatedColdStartMs: 1000,
        estimatedMemoryMB: 512,
        triggers: ['cron:*/60 * * * *', 'event:agent.trade_signal'],
        dependencies: ['utils/helpers', 'utils/logger', 'middleware/resilience'],
        env: { NODE_ENV: 'production', AGENT_MODE: 'autonomous' },
        scaling: { minInstances: 1, maxInstances: 10, concurrency: 1, timeoutMs: 60000 },
      },
      {
        name: 'analytics-report-generator',
        sourceModule: 'src/analytics/analytics-engine.ts',
        entryFunction: 'generateAssetReport',
        description: 'Generates asset analysis reports — compute-heavy, WASM candidate',
        target: 'wasm',
        estimatedColdStartMs: 100,
        estimatedMemoryMB: 128,
        triggers: ['api:GET /api/v1/analytics/report/:symbol', 'event:report.requested'],
        dependencies: ['utils/helpers', 'utils/logger'],
        env: { NODE_ENV: 'production' },
        scaling: { minInstances: 0, maxInstances: 200, concurrency: 20, timeoutMs: 15000 },
      },
      {
        name: 'community-notification-dispatcher',
        sourceModule: 'src/community/community-engine.ts',
        entryFunction: 'dispatchNotifications',
        description: 'Dispatches community notifications — fire-and-forget, ideal for edge',
        target: 'edge_function',
        estimatedColdStartMs: 30,
        estimatedMemoryMB: 32,
        triggers: ['event:post:created', 'event:proposal:voted', 'event:member:followed'],
        dependencies: ['utils/helpers', 'utils/logger'],
        env: { NODE_ENV: 'production' },
        scaling: { minInstances: 0, maxInstances: 1000, concurrency: 100, timeoutMs: 3000 },
      },
      {
        name: 'commodity-price-updater',
        sourceModule: 'src/commodities/commodity-engine.ts',
        entryFunction: 'updatePrices',
        description: 'Fetches and updates commodity prices — scheduled, idempotent',
        target: 'lambda',
        estimatedColdStartMs: 200,
        estimatedMemoryMB: 128,
        triggers: ['cron:*/5 * * * *', 'event:prices.refresh_requested'],
        dependencies: ['utils/helpers', 'utils/logger'],
        env: { NODE_ENV: 'production' },
        scaling: { minInstances: 0, maxInstances: 5, concurrency: 1, timeoutMs: 30000 },
      },
    ];

    for (const m of manifests) {
      const id = generateId('nano');
      this.nanoManifests.set(id, { ...m, id });
    }
  }

  private seedHealthRules(): void {
    const rules: Array<Omit<HealthRule, 'id' | 'triggerCount' | 'isActive'>> = [
      {
        serviceName: 'arcadian-exchange', metric: 'responseTime', operator: 'gt',
        threshold: 5000, action: 'alert', cooldownMs: 60000,
      },
      {
        serviceName: 'arcadian-exchange', metric: 'consecutiveFailures', operator: 'gte',
        threshold: 3, action: 'restart', cooldownMs: 120000,
      },
      {
        serviceName: 'arcadian-exchange', metric: 'memoryUsage', operator: 'gt',
        threshold: 512, action: 'alert', cooldownMs: 300000,
      },
    ];

    for (const r of rules) {
      this.addHealthRule(r);
    }
  }
}