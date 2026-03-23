/**
 * Arcadian Exchange — Admin Engine
 * Secure key management, API key generation, and external service configuration
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 *
 * Features:
 *   - AES-256-GCM encryption at rest for all secrets
 *   - Private key input & storage
 *   - API key generation with crypto-grade randomness
 *   - API key rotation with automatic revocation of old keys
 *   - External service link management
 *   - Audit trail for all admin operations
 *   - Key expiry & lifecycle management
 *   - Zero-cost: no external KMS dependency — self-contained
 */

import crypto from 'crypto';
import { generateId, nowISO } from '../utils/helpers';
import { logger } from '../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────

export type KeyType =
  | 'private_key' | 'api_key' | 'api_secret' | 'jwt_secret'
  | 'webhook_secret' | 'encryption_key' | 'ssh_key' | 'custom';

export type KeyStatus = 'active' | 'revoked' | 'expired' | 'rotated';

export type AuthType = 'api_key' | 'bearer' | 'basic' | 'oauth2' | 'custom' | 'none';

export type AuditAction =
  | 'key.stored' | 'key.retrieved' | 'key.updated' | 'key.revoked'
  | 'key.rotated' | 'key.deleted' | 'key.generated'
  | 'link.created' | 'link.updated' | 'link.deleted' | 'link.tested'
  | 'config.updated' | 'admin.login';

export interface StoredKey {
  id: string;
  name: string;
  service: string;
  keyType: KeyType;
  encryptedValue: string;     // AES-256-GCM encrypted
  iv: string;                 // Initialization vector (hex)
  authTag: string;            // GCM auth tag (hex)
  description?: string;
  status: KeyStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  rotatedFromId?: string;
  metadata: Record<string, string>;
  fingerprint: string;        // SHA-256 of the plaintext (for identification without decryption)
}

export interface GeneratedAPIKey {
  id: string;
  name: string;
  service: string;
  keyPrefix: string;          // First 8 chars shown in listings
  encryptedKey: string;
  iv: string;
  authTag: string;
  permissions: string[];
  rateLimit: number;
  status: KeyStatus;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  usageCount: number;
  description?: string;
  fingerprint: string;
}

export interface ExternalServiceLink {
  id: string;
  name: string;
  service: string;
  baseUrl: string;
  apiKeyHeaderName: string;
  encryptedApiKey?: string;
  iv?: string;
  authTag?: string;
  authType: AuthType;
  status: 'active' | 'inactive' | 'error';
  lastHealthCheck?: string;
  lastHealthStatus?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, string>;
}

export interface AdminAuditEntry {
  id: string;
  action: AuditAction;
  targetId: string;
  targetType: 'key' | 'api_key' | 'link' | 'config';
  performedBy: string;
  details: string;
  ipAddress?: string;
  timestamp: string;
  integrityHash: string;       // SHA-512 chain
}

export interface PlatformConfig {
  id: string;
  key: string;
  value: string;
  category: 'security' | 'trading' | 'defi' | 'compliance' | 'general' | 'integration';
  isSecret: boolean;
  updatedAt: string;
  updatedBy: string;
}

// ── Encryption Utilities ──────────────────────────────────────────────

class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;  // 256 bits
  private masterKey: Buffer;

  constructor() {
    const envKey = process.env.ADMIN_MASTER_KEY || process.env.IAM_JWT_SECRET || '';
    if (!envKey || envKey === 'change_me_to_a_long_random_secret') {
      // Derive a deterministic but unique key from system entropy
      const seed = `arcadian-exchange-${process.pid}-${Date.now()}`;
      this.masterKey = crypto.createHash('sha256').update(seed).digest();
      logger.warn('ADMIN_MASTER_KEY not set — using derived key (set in production!)');
    } else {
      // Derive 256-bit key from the provided secret
      this.masterKey = crypto.scryptSync(envKey, 'arcadian-exchange-salt-2060', this.keyLength);
    }
  }

  encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv) as crypto.CipherGCM;
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return { encrypted, iv: iv.toString('hex'), authTag };
  }

  decrypt(encrypted: string, ivHex: string, authTagHex: string): string {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  fingerprint(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
  }

  generateAPIKey(prefix = 'arc'): string {
    const random = crypto.randomBytes(32).toString('base64url');
    return `${prefix}_${random}`;
  }

  generateSecret(length = 64): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  integrityHash(data: string, previousHash = ''): string {
    return crypto.createHash('sha512').update(`${previousHash}:${data}`).digest('hex');
  }
}

// ── Admin Engine ──────────────────────────────────────────────────────

export class AdminEngine {
  private keys: Map<string, StoredKey> = new Map();
  private apiKeys: Map<string, GeneratedAPIKey> = new Map();
  private links: Map<string, ExternalServiceLink> = new Map();
  private audit: AdminAuditEntry[] = [];
  private configs: Map<string, PlatformConfig> = new Map();
  private readonly crypto: EncryptionService;
  private lastAuditHash = '';

  constructor() {
    this.crypto = new EncryptionService();
    this.seedDefaultConfigs();
    logger.info('AdminEngine initialised — secure key management active');
  }

  // ── Key Storage ───────────────────────────────────────────────────

  storeKey(params: {
    name: string;
    service: string;
    keyType: KeyType;
    value: string;
    description?: string;
    expiresAt?: string;
    metadata?: Record<string, string>;
    performedBy?: string;
  }): Omit<StoredKey, 'encryptedValue' | 'iv' | 'authTag'> & { stored: true } {
    const { encrypted, iv, authTag } = this.crypto.encrypt(params.value);
    const fingerprint = this.crypto.fingerprint(params.value);

    const key: StoredKey = {
      id: generateId('key'),
      name: params.name,
      service: params.service,
      keyType: params.keyType,
      encryptedValue: encrypted,
      iv, authTag,
      description: params.description,
      status: 'active',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      expiresAt: params.expiresAt,
      metadata: params.metadata || {},
      fingerprint,
    };

    this.keys.set(key.id, key);
    this.addAudit('key.stored', key.id, 'key', params.performedBy || 'system',
      `Stored ${params.keyType} for ${params.service}: ${params.name}`);

    logger.info({ keyId: key.id, service: params.service, type: params.keyType }, 'Key stored securely');

    return {
      id: key.id, name: key.name, service: key.service, keyType: key.keyType,
      description: key.description, status: key.status,
      createdAt: key.createdAt, updatedAt: key.updatedAt,
      expiresAt: key.expiresAt, lastUsedAt: key.lastUsedAt,
      rotatedFromId: key.rotatedFromId,
      metadata: key.metadata, fingerprint: key.fingerprint,
      stored: true,
    };
  }

  retrieveKey(keyId: string, performedBy: string): string {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Key ${keyId} not found`);
    if (key.status !== 'active') throw new Error(`Key ${keyId} is ${key.status}`);
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      key.status = 'expired';
      throw new Error(`Key ${keyId} has expired`);
    }

    const decrypted = this.crypto.decrypt(key.encryptedValue, key.iv, key.authTag);
    key.lastUsedAt = nowISO();

    this.addAudit('key.retrieved', keyId, 'key', performedBy,
      `Retrieved ${key.keyType} for ${key.service}: ${key.name}`);

    return decrypted;
  }

  updateKey(keyId: string, updates: {
    name?: string;
    value?: string;
    description?: string;
    expiresAt?: string;
    isActive?: boolean;
    metadata?: Record<string, string>;
  }, performedBy: string): Omit<StoredKey, 'encryptedValue' | 'iv' | 'authTag'> {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Key ${keyId} not found`);

    if (updates.name) key.name = updates.name;
    if (updates.description !== undefined) key.description = updates.description;
    if (updates.expiresAt) key.expiresAt = updates.expiresAt;
    if (updates.isActive !== undefined) key.status = updates.isActive ? 'active' : 'revoked';
    if (updates.metadata) key.metadata = { ...key.metadata, ...updates.metadata };
    if (updates.value) {
      const { encrypted, iv, authTag } = this.crypto.encrypt(updates.value);
      key.encryptedValue = encrypted;
      key.iv = iv;
      key.authTag = authTag;
      key.fingerprint = this.crypto.fingerprint(updates.value);
    }
    key.updatedAt = nowISO();

    this.addAudit('key.updated', keyId, 'key', performedBy,
      `Updated key: ${key.name} (${Object.keys(updates).join(', ')})`);

    const { encryptedValue: _e, iv: _i, authTag: _a, ...safe } = key;
    return safe;
  }

  revokeKey(keyId: string, performedBy: string): void {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Key ${keyId} not found`);
    key.status = 'revoked';
    key.updatedAt = nowISO();
    this.addAudit('key.revoked', keyId, 'key', performedBy,
      `Revoked key: ${key.name} (${key.service})`);
    logger.info({ keyId, service: key.service }, 'Key revoked');
  }

  rotateKey(keyId: string, newValue: string, performedBy: string): Omit<StoredKey, 'encryptedValue' | 'iv' | 'authTag'> & { stored: true } {
    const oldKey = this.keys.get(keyId);
    if (!oldKey) throw new Error(`Key ${keyId} not found`);

    // Revoke old key
    oldKey.status = 'rotated';
    oldKey.updatedAt = nowISO();

    // Store new key
    const result = this.storeKey({
      name: oldKey.name,
      service: oldKey.service,
      keyType: oldKey.keyType,
      value: newValue,
      description: oldKey.description,
      expiresAt: oldKey.expiresAt,
      metadata: { ...oldKey.metadata, rotatedFrom: keyId },
      performedBy,
    });

    // Link rotation chain
    const newKey = this.keys.get(result.id);
    if (newKey) newKey.rotatedFromId = keyId;

    this.addAudit('key.rotated', keyId, 'key', performedBy,
      `Rotated key ${oldKey.name} → ${result.id}`);

    return result;
  }

  deleteKey(keyId: string, performedBy: string): void {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Key ${keyId} not found`);
    this.keys.delete(keyId);
    this.addAudit('key.deleted', keyId, 'key', performedBy,
      `Deleted key: ${key.name} (${key.service})`);
  }

  listKeys(filters?: { service?: string; keyType?: KeyType; status?: KeyStatus }): Array<Omit<StoredKey, 'encryptedValue' | 'iv' | 'authTag'>> {
    let results = Array.from(this.keys.values());
    if (filters?.service) results = results.filter(k => k.service === filters.service);
    if (filters?.keyType) results = results.filter(k => k.keyType === filters.keyType);
    if (filters?.status) results = results.filter(k => k.status === filters.status);
    return results.map(({ encryptedValue: _e, iv: _i, authTag: _a, ...safe }) => safe);
  }

  // ── API Key Generation ────────────────────────────────────────────

  generateAPIKey(params: {
    name: string;
    service: string;
    permissions?: string[];
    rateLimit?: number;
    expiresInDays?: number;
    description?: string;
    performedBy?: string;
  }): { apiKey: string; id: string; keyPrefix: string; expiresAt?: string } {
    const plainKey = this.crypto.generateAPIKey('arc');
    const { encrypted, iv, authTag } = this.crypto.encrypt(plainKey);
    const fingerprint = this.crypto.fingerprint(plainKey);

    const expiresAt = params.expiresInDays
      ? new Date(Date.now() + params.expiresInDays * 86400000).toISOString()
      : undefined;

    const apiKey: GeneratedAPIKey = {
      id: generateId('apk'),
      name: params.name,
      service: params.service,
      keyPrefix: plainKey.slice(0, 12),
      encryptedKey: encrypted,
      iv, authTag,
      permissions: params.permissions || ['read'],
      rateLimit: params.rateLimit || 1000,
      status: 'active',
      createdAt: nowISO(),
      expiresAt,
      usageCount: 0,
      description: params.description,
      fingerprint,
    };

    this.apiKeys.set(apiKey.id, apiKey);

    this.addAudit('key.generated', apiKey.id, 'api_key', params.performedBy || 'system',
      `Generated API key for ${params.service}: ${params.name} (${apiKey.keyPrefix}…)`);

    logger.info({ apiKeyId: apiKey.id, service: params.service }, 'API key generated');

    // Return the plaintext key — only shown once!
    return {
      apiKey: plainKey,
      id: apiKey.id,
      keyPrefix: apiKey.keyPrefix,
      expiresAt,
    };
  }

  validateAPIKey(plainKey: string): GeneratedAPIKey | null {
    for (const ak of this.apiKeys.values()) {
      if (ak.status !== 'active') continue;
      if (ak.expiresAt && new Date(ak.expiresAt) < new Date()) {
        ak.status = 'expired';
        continue;
      }
      try {
        const decrypted = this.crypto.decrypt(ak.encryptedKey, ak.iv, ak.authTag);
        if (decrypted === plainKey) {
          ak.lastUsedAt = nowISO();
          ak.usageCount++;
          return ak;
        }
      } catch { continue; }
    }
    return null;
  }

  revokeAPIKey(apiKeyId: string, performedBy: string): void {
    const key = this.apiKeys.get(apiKeyId);
    if (!key) throw new Error(`API key ${apiKeyId} not found`);
    key.status = 'revoked';
    this.addAudit('key.revoked', apiKeyId, 'api_key', performedBy,
      `Revoked API key: ${key.name} (${key.keyPrefix}…)`);
    logger.info({ apiKeyId, service: key.service }, 'API key revoked');
  }

  rotateAPIKey(apiKeyId: string, performedBy: string): { newApiKey: string; newId: string; oldKeyRevoked: true } {
    const oldKey = this.apiKeys.get(apiKeyId);
    if (!oldKey) throw new Error(`API key ${apiKeyId} not found`);

    // Revoke old
    oldKey.status = 'rotated';

    // Generate new with same config
    const result = this.generateAPIKey({
      name: oldKey.name,
      service: oldKey.service,
      permissions: oldKey.permissions,
      rateLimit: oldKey.rateLimit,
      description: oldKey.description,
      performedBy,
    });

    return { newApiKey: result.apiKey, newId: result.id, oldKeyRevoked: true };
  }

  listAPIKeys(filters?: { service?: string; status?: KeyStatus }): Array<Omit<GeneratedAPIKey, 'encryptedKey' | 'iv' | 'authTag'>> {
    let results = Array.from(this.apiKeys.values());
    if (filters?.service) results = results.filter(k => k.service === filters.service);
    if (filters?.status) results = results.filter(k => k.status === filters.status);
    return results.map(({ encryptedKey: _e, iv: _i, authTag: _a, ...safe }) => safe);
  }

  // ── External Service Links ────────────────────────────────────────

  createServiceLink(params: {
    name: string;
    service: string;
    baseUrl: string;
    apiKeyHeaderName?: string;
    apiKeyValue?: string;
    authType?: AuthType;
    description?: string;
    healthCheckUrl?: string;
    metadata?: Record<string, string>;
    performedBy?: string;
  }): ExternalServiceLink {
    let encryptedApiKey: string | undefined;
    let iv: string | undefined;
    let authTag: string | undefined;

    if (params.apiKeyValue) {
      const enc = this.crypto.encrypt(params.apiKeyValue);
      encryptedApiKey = enc.encrypted;
      iv = enc.iv;
      authTag = enc.authTag;
    }

    const link: ExternalServiceLink = {
      id: generateId('lnk'),
      name: params.name,
      service: params.service,
      baseUrl: params.baseUrl,
      apiKeyHeaderName: params.apiKeyHeaderName || 'Authorization',
      encryptedApiKey, iv, authTag,
      authType: params.authType || 'api_key',
      status: 'active',
      description: params.description,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      metadata: params.metadata || {},
    };

    this.links.set(link.id, link);

    this.addAudit('link.created', link.id, 'link', params.performedBy || 'system',
      `Created service link: ${params.name} → ${params.baseUrl}`);

    logger.info({ linkId: link.id, service: params.service, baseUrl: params.baseUrl }, 'External service link created');

    return { ...link, encryptedApiKey: undefined, iv: undefined, authTag: undefined };
  }

  updateServiceLink(linkId: string, updates: Partial<{
    name: string;
    baseUrl: string;
    apiKeyValue: string;
    apiKeyHeaderName: string;
    authType: AuthType;
    description: string;
    status: 'active' | 'inactive';
    metadata: Record<string, string>;
  }>, performedBy: string): ExternalServiceLink {
    const link = this.links.get(linkId);
    if (!link) throw new Error(`Service link ${linkId} not found`);

    if (updates.name) link.name = updates.name;
    if (updates.baseUrl) link.baseUrl = updates.baseUrl;
    if (updates.apiKeyHeaderName) link.apiKeyHeaderName = updates.apiKeyHeaderName;
    if (updates.authType) link.authType = updates.authType;
    if (updates.description !== undefined) link.description = updates.description;
    if (updates.status) link.status = updates.status;
    if (updates.metadata) link.metadata = { ...link.metadata, ...updates.metadata };
    if (updates.apiKeyValue) {
      const enc = this.crypto.encrypt(updates.apiKeyValue);
      link.encryptedApiKey = enc.encrypted;
      link.iv = enc.iv;
      link.authTag = enc.authTag;
    }
    link.updatedAt = nowISO();

    this.addAudit('link.updated', linkId, 'link', performedBy,
      `Updated service link: ${link.name}`);

    return { ...link, encryptedApiKey: undefined, iv: undefined, authTag: undefined };
  }

  deleteServiceLink(linkId: string, performedBy: string): void {
    const link = this.links.get(linkId);
    if (!link) throw new Error(`Service link ${linkId} not found`);
    this.links.delete(linkId);
    this.addAudit('link.deleted', linkId, 'link', performedBy,
      `Deleted service link: ${link.name}`);
  }

  getServiceLink(linkId: string): ExternalServiceLink {
    const link = this.links.get(linkId);
    if (!link) throw new Error(`Service link ${linkId} not found`);
    return { ...link, encryptedApiKey: undefined, iv: undefined, authTag: undefined };
  }

  getServiceLinkSecret(linkId: string, performedBy: string): string {
    const link = this.links.get(linkId);
    if (!link) throw new Error(`Service link ${linkId} not found`);
    if (!link.encryptedApiKey || !link.iv || !link.authTag) throw new Error('No API key stored for this link');
    const decrypted = this.crypto.decrypt(link.encryptedApiKey, link.iv, link.authTag);
    this.addAudit('link.tested', linkId, 'link', performedBy,
      `Retrieved secret for service link: ${link.name}`);
    return decrypted;
  }

  listServiceLinks(filters?: { service?: string; status?: string }): ExternalServiceLink[] {
    let results = Array.from(this.links.values());
    if (filters?.service) results = results.filter(l => l.service === filters.service);
    if (filters?.status) results = results.filter(l => l.status === filters.status);
    return results.map(l => ({ ...l, encryptedApiKey: undefined, iv: undefined, authTag: undefined }));
  }

  // ── Platform Config ───────────────────────────────────────────────

  setConfig(key: string, value: string, category: PlatformConfig['category'], isSecret: boolean, updatedBy: string): PlatformConfig {
    const existing = this.configs.get(key);
    const config: PlatformConfig = {
      id: existing?.id || generateId('cfg'),
      key,
      value: isSecret ? this.crypto.encrypt(value).encrypted : value,
      category,
      isSecret,
      updatedAt: nowISO(),
      updatedBy,
    };
    this.configs.set(key, config);
    this.addAudit('config.updated', config.id, 'config', updatedBy, `Config ${key} updated`);
    return { ...config, value: isSecret ? '••••••••' : config.value };
  }

  getConfig(key: string): string | undefined {
    return this.configs.get(key)?.value;
  }

  listConfigs(category?: string): Array<Omit<PlatformConfig, 'value'> & { value: string }> {
    let results = Array.from(this.configs.values());
    if (category) results = results.filter(c => c.category === category);
    return results.map(c => ({ ...c, value: c.isSecret ? '••••••••' : c.value }));
  }

  // ── Audit Trail ───────────────────────────────────────────────────

  private addAudit(action: AuditAction, targetId: string, targetType: AdminAuditEntry['targetType'],
    performedBy: string, details: string, ipAddress?: string): void {
    const entry: AdminAuditEntry = {
      id: generateId('aud'),
      action, targetId, targetType,
      performedBy, details, ipAddress,
      timestamp: nowISO(),
      integrityHash: this.crypto.integrityHash(
        `${action}:${targetId}:${performedBy}:${Date.now()}`,
        this.lastAuditHash
      ),
    };
    this.audit.push(entry);
    this.lastAuditHash = entry.integrityHash;
    if (this.audit.length > 10000) this.audit = this.audit.slice(-10000);
  }

  getAuditTrail(filters?: {
    action?: AuditAction;
    targetType?: string;
    performedBy?: string;
    limit?: number;
  }): AdminAuditEntry[] {
    let results = [...this.audit];
    if (filters?.action) results = results.filter(a => a.action === filters.action);
    if (filters?.targetType) results = results.filter(a => a.targetType === filters.targetType);
    if (filters?.performedBy) results = results.filter(a => a.performedBy === filters.performedBy);
    return results.slice(-(filters?.limit || 100));
  }

  // ── Utilities ─────────────────────────────────────────────────────

  generateSecret(length?: number): string {
    return this.crypto.generateSecret(length);
  }

  getDashboardStats() {
    const activeKeys = Array.from(this.keys.values()).filter(k => k.status === 'active').length;
    const activeApiKeys = Array.from(this.apiKeys.values()).filter(k => k.status === 'active').length;
    const activeLinks = Array.from(this.links.values()).filter(l => l.status === 'active').length;
    const expiredKeys = Array.from(this.keys.values()).filter(k => k.status === 'expired').length;

    return {
      totalStoredKeys: this.keys.size,
      activeStoredKeys: activeKeys,
      totalAPIKeys: this.apiKeys.size,
      activeAPIKeys: activeApiKeys,
      totalServiceLinks: this.links.size,
      activeServiceLinks: activeLinks,
      expiredKeys,
      totalAuditEntries: this.audit.length,
      totalConfigs: this.configs.size,
      encryptionAlgorithm: 'AES-256-GCM',
      keyDerivation: 'scrypt',
      integrityChain: 'SHA-512',
      lastAuditHash: this.lastAuditHash.slice(0, 16) + '…',
    };
  }

  // ── Default Configs ───────────────────────────────────────────────

  private seedDefaultConfigs(): void {
    const defaults: Array<[string, string, PlatformConfig['category'], boolean]> = [
      ['platform.name', 'Arcadian Exchange', 'general', false],
      ['platform.version', '1.0.0', 'general', false],
      ['platform.standard', 'Industry 6.0 / Trancendos 2060', 'general', false],
      ['security.jwt_algorithm', 'HS512', 'security', false],
      ['security.rate_limit_window', '60000', 'security', false],
      ['security.rate_limit_max', '200', 'security', false],
      ['security.cors_origin', '*', 'security', false],
      ['security.crypto_migration_path', 'hmac_sha512 → ml_kem_2030 → hybrid_pqc_2040 → slh_dsa_2060', 'security', false],
      ['trading.copy_trading_enabled', 'true', 'trading', false],
      ['trading.max_leverage', '100', 'trading', false],
      ['defi.yield_farming_enabled', 'true', 'defi', false],
      ['compliance.default_jurisdiction', 'GLOBAL', 'compliance', false],
      ['integration.coingecko_enabled', 'false', 'integration', false],
      ['integration.yahoo_finance_enabled', 'false', 'integration', false],
    ];

    for (const [key, value, category, isSecret] of defaults) {
      this.configs.set(key, {
        id: generateId('cfg'),
        key, value, category, isSecret,
        updatedAt: nowISO(),
        updatedBy: 'system',
      });
    }
  }
}