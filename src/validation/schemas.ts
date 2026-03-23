/**
 * Arcadian Exchange — Zod Validation Schemas
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 * 
 * Comprehensive input validation for all API endpoints.
 * Uses Zod for zero-cost runtime type safety.
 */

import { z } from 'zod';

// ── Common Primitives ─────────────────────────────────────────────────

export const IdParam = z.string().min(1).max(128);
export const OwnerIdParam = z.string().min(1).max(128);
export const PositiveNumber = z.number().positive();
export const NonNegativeNumber = z.number().nonnegative();
export const PaginationLimit = z.coerce.number().int().min(1).max(500).default(20);
export const PaginationOffset = z.coerce.number().int().min(0).default(0);

// ── Token Schemas ─────────────────────────────────────────────────────

export const CreateWalletSchema = z.object({
  ownerId: z.string().min(1, 'ownerId is required').max(128),
});

export const TransferSchema = z.object({
  fromOwnerId: z.string().min(1, 'fromOwnerId is required'),
  toAddress: z.string().min(1, 'toAddress is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  memo: z.string().max(256).optional(),
});

export const StakeSchema = z.object({
  ownerId: z.string().min(1, 'ownerId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  lockDays: z.coerce.number().int().min(1).max(3650).optional(),
});

export const UnstakeSchema = z.object({
  ownerId: z.string().min(1, 'ownerId is required'),
  stakePositionId: z.string().min(1, 'stakePositionId is required'),
});

// ── Trading Schemas ───────────────────────────────────────────────────

export const DepositSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
});

export const PlaceOrderSchema = z.object({
  userId: z.string().min(1),
  assetSymbol: z.string().min(1).max(20),
  type: z.enum(['market', 'limit', 'stop_loss', 'take_profit', 'stop_limit', 'trailing_stop']),
  side: z.enum(['buy', 'sell']),
  quantity: z.coerce.number().positive(),
  price: z.coerce.number().positive().optional(),
  stopPrice: z.coerce.number().positive().optional(),
  takeProfitPrice: z.coerce.number().positive().optional(),
  leverage: z.coerce.number().min(1).max(100).optional(),
  notes: z.string().max(500).optional(),
});

export const CancelOrderSchema = z.object({
  userId: z.string().min(1),
});

export const ClosePositionSchema = z.object({
  userId: z.string().min(1),
  quantity: z.coerce.number().positive().optional(),
});

export const CopyTradeSchema = z.object({
  followerId: z.string().min(1),
  traderProfileId: z.string().min(1),
  allocationPercent: z.coerce.number().min(0.01).max(100).optional(),
  maxPositionUsd: z.coerce.number().positive().optional(),
  stopLossPercent: z.coerce.number().min(0).max(100).optional(),
});

export const StopCopySchema = z.object({
  followerId: z.string().min(1),
});

export const CreateAlertSchema = z.object({
  userId: z.string().min(1),
  assetSymbol: z.string().min(1).max(20),
  condition: z.enum(['above', 'below', 'crosses']),
  price: z.coerce.number().positive(),
  message: z.string().max(256).optional(),
});

// ── DeFi Schemas ──────────────────────────────────────────────────────

export const AddLiquiditySchema = z.object({
  userId: z.string().min(1),
  poolId: z.string().min(1),
  amountA: z.coerce.number().positive(),
  amountB: z.coerce.number().positive(),
});

export const RemoveLiquiditySchema = z.object({
  userId: z.string().min(1),
});

export const DepositYieldSchema = z.object({
  userId: z.string().min(1),
  farmId: z.string().min(1),
  amount: z.coerce.number().positive(),
  token: z.string().min(1),
});

export const HarvestYieldSchema = z.object({
  userId: z.string().min(1),
});

export const LendDepositSchema = z.object({
  userId: z.string().min(1),
  poolId: z.string().min(1),
  amount: z.coerce.number().positive(),
});

export const BorrowSchema = z.object({
  userId: z.string().min(1),
  poolId: z.string().min(1),
  amount: z.coerce.number().positive(),
  collateral: z.coerce.number().positive(),
});

export const SwapSchema = z.object({
  userId: z.string().min(1),
  tokenIn: z.string().min(1),
  tokenOut: z.string().min(1),
  amountIn: z.coerce.number().positive(),
});

// ── NFT Schemas ───────────────────────────────────────────────────────

export const MintNFTSchema = z.object({
  creatorId: z.string().min(1),
  creatorName: z.string().min(1).max(100),
  category: z.enum(['art', 'photography', 'music', 'video', 'gaming', 'collectible', 'utility', 'phygital', 'membership', 'domain']),
  standard: z.enum(['ERC-721', 'ERC-1155', 'phygital', 'soulbound']).optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  imageUrl: z.string().url().optional(),
  royaltyPercent: z.coerce.number().min(0).max(50).optional(),
  collectionId: z.string().optional(),
  isSoulbound: z.boolean().optional(),
});

export const CreateNFTListingSchema = z.object({
  nftId: z.string().min(1),
  sellerId: z.string().min(1),
  sellerName: z.string().min(1).max(100),
  type: z.enum(['fixed_price', 'auction', 'dutch_auction', 'bundle']),
  price: z.coerce.number().nonnegative(),
  currency: z.string().min(1).max(10).optional(),
  startingPrice: z.coerce.number().positive().optional(),
  reservePrice: z.coerce.number().positive().optional(),
  auctionDurationHours: z.coerce.number().positive().optional(),
  startPrice: z.coerce.number().positive().optional(),
  endPrice: z.coerce.number().positive().optional(),
  expiresInDays: z.coerce.number().positive().optional(),
});

export const BuyNowSchema = z.object({
  buyerId: z.string().min(1),
  buyerName: z.string().min(1).max(100),
});

export const PlaceBidSchema = z.object({
  bidderId: z.string().min(1),
  bidderName: z.string().min(1).max(100),
  amount: z.coerce.number().positive(),
});

// ── Commodity Schemas ─────────────────────────────────────────────────

export const OpenContractSchema = z.object({
  userId: z.string().min(1),
  commodityId: z.string().min(1),
  contractType: z.enum(['spot', 'futures', 'forward', 'option', 'tokenized']),
  side: z.enum(['buy', 'sell']),
  quantity: z.coerce.number().positive(),
  leverage: z.coerce.number().min(1).max(100).optional(),
  expiryDays: z.coerce.number().int().positive().optional(),
});

export const TokenizeSchema = z.object({
  userId: z.string().min(1),
  commodityId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  vaultId: z.string().optional(),
});

export const InvestRWASchema = z.object({
  userId: z.string().min(1),
  assetId: z.string().min(1),
  amount: z.coerce.number().positive(),
});

// ── Warehouse Schemas ─────────────────────────────────────────────────

export const CreateVaultSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  type: z.enum(['cold_vault', 'secure_warehouse', 'bonded_warehouse', 'free_trade_zone', 'digital_locker']),
  capacityKg: z.coerce.number().positive(),
  securityLevel: z.coerce.number().int().min(1).max(5).optional(),
  insurancePolicyId: z.string().optional(),
  operatorId: z.string().min(1),
});

export const DepositItemSchema = z.object({
  vaultId: z.string().min(1),
  ownerId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  commodityType: z.string().min(1),
  quantityKg: z.coerce.number().positive(),
  estimatedValue: z.coerce.number().positive(),
  serialNumber: z.string().optional(),
  certifications: z.array(z.string()).optional(),
});

// ── Agent Schemas ─────────────────────────────────────────────────────

export const CreateAgentSchema = z.object({
  ownerId: z.string().min(1),
  name: z.string().min(1).max(200),
  strategy: z.enum([
    'dca_accumulator', 'grid_trader', 'momentum_rider', 'mean_reversion',
    'yield_optimizer', 'arbitrage_scanner', 'copy_trade_amplifier',
    'sentiment_follower', 'rwa_harvester', 'commodity_cycler',
    'nft_flipper', 'liquidity_miner',
  ]),
  riskLevel: z.enum(['conservative', 'moderate', 'aggressive', 'ultra']),
  allocatedCapital: z.coerce.number().positive(),
  assets: z.array(z.string()).min(1).optional(),
  maxDrawdownPercent: z.coerce.number().min(1).max(100).optional(),
  takeProfitPercent: z.coerce.number().min(0.1).max(10000).optional(),
  rebalanceIntervalHours: z.coerce.number().min(0.1).optional(),
});

export const AgentActionSchema = z.object({
  ownerId: z.string().min(1),
});

// ── Compliance Schemas ────────────────────────────────────────────────

export const SubmitKYCSchema = z.object({
  userId: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().min(8),
  nationality: z.string().min(2).max(50),
  country: z.string().min(2).max(50),
  address: z.string().min(5).max(500),
  documentType: z.enum(['passport', 'national_id', 'drivers_license']),
  documentNumber: z.string().min(1),
  documentExpiry: z.string().min(8),
});

export const MonitorTransactionSchema = z.object({
  userId: z.string().min(1),
  amount: z.coerce.number().positive(),
  asset: z.string().min(1),
});

export const UpgradeTierSchema = z.object({
  newTier: z.enum(['basic', 'verified', 'professional', 'institutional']),
});

export const ResolveAlertSchema = z.object({
  resolvedBy: z.string().min(1),
});

// ── Marketplace Schemas ───────────────────────────────────────────────

export const CreateMarketplaceListingSchema = z.object({
  sellerId: z.string().min(1),
  sellerName: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  description: z.string().max(5000),
  category: z.enum([
    'ai_agent', 'trading_strategy', 'compliance_kit', 'data_feed',
    'analytics_tool', 'api_access', 'template', 'education',
    'signal_pack', 'white_label', 'custom_indicator', 'research_report',
    'nft_collection', 'defi_vault', 'insurance_product', 'hardware',
    'consulting', 'other',
  ]),
  price: z.coerce.number().nonnegative(),
  currency: z.enum(['USD', 'ARC', 'BTC', 'ETH', 'GBP', 'EUR']).optional(),
  tags: z.array(z.string()).optional(),
  imageUrl: z.string().url().optional(),
  downloadUrl: z.string().url().optional(),
  featured: z.boolean().optional(),
});

export const CreateMarketplaceOrderSchema = z.object({
  listingId: z.string().min(1),
  buyerId: z.string().min(1),
  quantity: z.coerce.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'processing', 'completed', 'cancelled', 'refunded']),
});

export const AddReviewSchema = z.object({
  listingId: z.string().min(1),
  orderId: z.string().min(1),
  reviewerId: z.string().min(1),
  reviewerName: z.string().min(1).max(100),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().min(1).max(200),
  body: z.string().max(5000),
});

// ── Community Schemas ─────────────────────────────────────────────────

export const RegisterMemberSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1).max(100),
  bio: z.string().max(1000).optional(),
  avatar: z.string().url().optional(),
});

export const FollowMemberSchema = z.object({
  followerId: z.string().min(1),
});

export const CreateCommunitySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
  type: z.enum(['public', 'private', 'premium']).optional(),
  topic: z.enum(['general', 'crypto', 'stocks', 'commodities', 'nft', 'defi', 'ai', 'education', 'memes']).optional(),
  tags: z.array(z.string()).optional(),
  ownerId: z.string().min(1),
  iconUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  rules: z.array(z.string()).optional(),
});

export const JoinCommunitySchema = z.object({
  userId: z.string().min(1),
});

export const CreatePostSchema = z.object({
  communityId: z.string().min(1),
  authorId: z.string().min(1),
  type: z.enum(['analysis', 'signal', 'news', 'discussion', 'education', 'meme', 'alert']).optional(),
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(50000),
  assets: z.array(z.string()).optional(),
  attachments: z.array(z.object({
    type: z.enum(['image', 'video', 'link', 'chart', 'document']),
    url: z.string().url(),
    label: z.string().optional(),
  })).optional(),
  tradeSignal: z.object({
    asset: z.string(),
    direction: z.enum(['long', 'short', 'neutral']),
    entryPrice: z.coerce.number().positive(),
    targetPrice: z.coerce.number().positive().optional(),
    stopLoss: z.coerce.number().positive().optional(),
    confidence: z.coerce.number().min(0).max(1).optional(),
    timeframe: z.string().optional(),
  }).optional(),
});

export const ReactToPostSchema = z.object({
  userId: z.string().min(1),
  reaction: z.enum(['bullish', 'bearish', 'neutral', 'rocket', 'fire', 'warning', 'gem']),
});

export const AddCommentSchema = z.object({
  authorId: z.string().min(1),
  content: z.string().min(1).max(10000),
  parentId: z.string().optional(),
});

export const CreateEventSchema = z.object({
  communityId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(5000),
  type: z.enum(['webinar', 'trading_room', 'ama', 'competition', 'governance_vote', 'launch']),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  hostId: z.string().min(1),
  maxAttendees: z.coerce.number().int().positive().optional(),
  streamUrl: z.string().url().optional(),
});

export const RegisterEventSchema = z.object({
  userId: z.string().min(1),
});

export const CreateProposalSchema = z.object({
  communityId: z.string().min(1),
  authorId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(50000),
  options: z.array(z.string().min(1)).min(2).max(10),
  requiredQuorum: z.coerce.number().min(1).optional(),
  votingEndsAt: z.string().datetime(),
});

export const VoteProposalSchema = z.object({
  voterId: z.string().min(1),
  vote: z.string().min(1),
  arcStaked: z.coerce.number().nonnegative(),
  reason: z.string().max(1000).optional(),
});

// ── Analytics Schemas ─────────────────────────────────────────────────

export const PortfolioAnalysisSchema = z.object({
  userId: z.string().min(1),
  holdings: z.array(z.object({
    asset: z.string().min(1),
    quantity: z.coerce.number().positive(),
    avgPrice: z.coerce.number().positive(),
  })).min(1),
});

// ── Admin Schemas ─────────────────────────────────────────────────────

export const StoreKeySchema = z.object({
  name: z.string().min(1).max(200),
  service: z.string().min(1).max(100),
  keyType: z.enum(['private_key', 'api_key', 'api_secret', 'jwt_secret', 'webhook_secret', 'encryption_key', 'ssh_key', 'custom']),
  value: z.string().min(1).max(10000),
  description: z.string().max(1000).optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.string()).optional(),
});

export const UpdateKeySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  value: z.string().min(1).max(10000).optional(),
  description: z.string().max(1000).optional(),
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.string()).optional(),
});

export const GenerateAPIKeySchema = z.object({
  name: z.string().min(1).max(200),
  service: z.string().min(1).max(100),
  permissions: z.array(z.string()).optional(),
  rateLimit: z.coerce.number().int().min(1).max(100000).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(3650).optional(),
  description: z.string().max(1000).optional(),
});

export const StoreExternalLinkSchema = z.object({
  name: z.string().min(1).max(200),
  service: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  apiKeyHeaderName: z.string().max(100).optional(),
  apiKeyValue: z.string().max(5000).optional(),
  authType: z.enum(['api_key', 'bearer', 'basic', 'oauth2', 'custom', 'none']).optional(),
  description: z.string().max(1000).optional(),
  healthCheckUrl: z.string().url().optional(),
  metadata: z.record(z.string()).optional(),
});

// ── Validation Helper ─────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';

export function validate<T>(schema: z.ZodSchema<T>, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
        code: i.code,
      }));
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
      return;
    }
    (req as any).validated = result.data;
    next();
  };
}