/**
 * Arcadia — Marketplace Engine
 *
 * Community platform and marketplace for the Trancendos ecosystem.
 * Manages listings, orders, reviews, and marketplace analytics.
 * Zero-cost compliant — no LLM calls, all rule-based logic.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────

export type ListingCategory =
  | 'digital_asset'
  | 'service'
  | 'template'
  | 'plugin'
  | 'data'
  | 'nft'
  | 'subscription'
  | 'other';

export type ListingStatus = 'draft' | 'active' | 'paused' | 'sold' | 'expired' | 'removed';
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled' | 'refunded';
export type Currency = 'USD' | 'ARC' | 'BTC' | 'ETH';

export interface Listing {
  id: string;
  title: string;
  description: string;
  category: ListingCategory;
  sellerId: string;
  sellerName: string;
  price: number;
  currency: Currency;
  status: ListingStatus;
  tags: string[];
  images: string[];
  inventory?: number;       // undefined = unlimited
  viewCount: number;
  purchaseCount: number;
  rating: number;           // 0–5
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface Order {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  sellerId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  currency: Currency;
  status: OrderStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface Review {
  id: string;
  listingId: string;
  orderId: string;
  reviewerId: string;
  reviewerName: string;
  rating: number;           // 1–5
  title: string;
  body: string;
  helpful: number;
  createdAt: Date;
}

export interface MarketplaceStats {
  totalListings: number;
  activeListings: number;
  totalOrders: number;
  completedOrders: number;
  totalRevenue: number;
  totalReviews: number;
  averageRating: number;
  topCategories: Array<{ category: ListingCategory; count: number }>;
  topSellers: Array<{ sellerId: string; sellerName: string; sales: number }>;
}

// ── Engine ─────────────────────────────────────────────────────────────────

export class MarketplaceEngine {
  private listings: Map<string, Listing> = new Map();
  private orders: Map<string, Order> = new Map();
  private reviews: Review[] = [];

  constructor() {
    this.seedListings();
    logger.info('MarketplaceEngine initialized');
  }

  // ── Listings ─────────────────────────────────────────────────────────────

  createListing(params: {
    title: string;
    description: string;
    category: ListingCategory;
    sellerId: string;
    sellerName: string;
    price: number;
    currency?: Currency;
    tags?: string[];
    images?: string[];
    inventory?: number;
    expiresAt?: Date;
  }): Listing {
    const listing: Listing = {
      id: uuidv4(),
      title: params.title,
      description: params.description,
      category: params.category,
      sellerId: params.sellerId,
      sellerName: params.sellerName,
      price: params.price,
      currency: params.currency ?? 'USD',
      status: 'active',
      tags: params.tags ?? [],
      images: params.images ?? [],
      inventory: params.inventory,
      viewCount: 0,
      purchaseCount: 0,
      rating: 0,
      reviewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: params.expiresAt,
    };
    this.listings.set(listing.id, listing);
    logger.info({ listingId: listing.id, title: listing.title, category: listing.category }, 'Listing created');
    return listing;
  }

  getListing(listingId: string): Listing | undefined {
    const listing = this.listings.get(listingId);
    if (listing) {
      listing.viewCount++;
      listing.updatedAt = new Date();
    }
    return listing;
  }

  getListings(filters?: {
    category?: ListingCategory;
    status?: ListingStatus;
    sellerId?: string;
    minPrice?: number;
    maxPrice?: number;
    currency?: Currency;
    tags?: string[];
    search?: string;
    limit?: number;
  }): Listing[] {
    let listings = Array.from(this.listings.values());

    if (filters?.category) listings = listings.filter(l => l.category === filters.category);
    if (filters?.status) listings = listings.filter(l => l.status === filters.status);
    if (filters?.sellerId) listings = listings.filter(l => l.sellerId === filters.sellerId);
    if (filters?.minPrice !== undefined) listings = listings.filter(l => l.price >= filters.minPrice!);
    if (filters?.maxPrice !== undefined) listings = listings.filter(l => l.price <= filters.maxPrice!);
    if (filters?.currency) listings = listings.filter(l => l.currency === filters.currency);
    if (filters?.tags?.length) {
      listings = listings.filter(l => filters.tags!.some(t => l.tags.includes(t)));
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      listings = listings.filter(l =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // Sort by rating desc, then by createdAt desc
    listings.sort((a, b) => b.rating - a.rating || b.createdAt.getTime() - a.createdAt.getTime());

    if (filters?.limit) listings = listings.slice(0, filters.limit);
    return listings;
  }

  updateListing(listingId: string, updates: Partial<Pick<Listing, 'title' | 'description' | 'price' | 'status' | 'tags' | 'images' | 'inventory'>>): Listing | undefined {
    const listing = this.listings.get(listingId);
    if (!listing) return undefined;
    Object.assign(listing, updates, { updatedAt: new Date() });
    logger.info({ listingId, updates }, 'Listing updated');
    return listing;
  }

  removeListing(listingId: string): boolean {
    const listing = this.listings.get(listingId);
    if (!listing) return false;
    listing.status = 'removed';
    listing.updatedAt = new Date();
    logger.info({ listingId }, 'Listing removed');
    return true;
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  createOrder(params: {
    listingId: string;
    buyerId: string;
    quantity?: number;
    notes?: string;
  }): Order {
    const listing = this.listings.get(params.listingId);
    if (!listing) throw new Error(`Listing ${params.listingId} not found`);
    if (listing.status !== 'active') throw new Error(`Listing is not active (status: ${listing.status})`);

    const quantity = params.quantity ?? 1;
    if (listing.inventory !== undefined && listing.inventory < quantity) {
      throw new Error(`Insufficient inventory: ${listing.inventory} available`);
    }

    const order: Order = {
      id: uuidv4(),
      listingId: listing.id,
      listingTitle: listing.title,
      buyerId: params.buyerId,
      sellerId: listing.sellerId,
      quantity,
      unitPrice: listing.price,
      totalPrice: listing.price * quantity,
      currency: listing.currency,
      status: 'pending',
      notes: params.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.orders.set(order.id, order);

    // Update inventory
    if (listing.inventory !== undefined) {
      listing.inventory -= quantity;
      if (listing.inventory === 0) listing.status = 'sold';
    }

    logger.info({ orderId: order.id, listingId: listing.id, buyerId: params.buyerId }, 'Order created');
    return order;
  }

  updateOrderStatus(orderId: string, status: OrderStatus): Order | undefined {
    const order = this.orders.get(orderId);
    if (!order) return undefined;
    order.status = status;
    order.updatedAt = new Date();
    if (status === 'completed') {
      order.completedAt = new Date();
      // Update listing purchase count
      const listing = this.listings.get(order.listingId);
      if (listing) listing.purchaseCount++;
    }
    logger.info({ orderId, status }, 'Order status updated');
    return order;
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  getOrders(filters?: {
    buyerId?: string;
    sellerId?: string;
    listingId?: string;
    status?: OrderStatus;
  }): Order[] {
    let orders = Array.from(this.orders.values());
    if (filters?.buyerId) orders = orders.filter(o => o.buyerId === filters.buyerId);
    if (filters?.sellerId) orders = orders.filter(o => o.sellerId === filters.sellerId);
    if (filters?.listingId) orders = orders.filter(o => o.listingId === filters.listingId);
    if (filters?.status) orders = orders.filter(o => o.status === filters.status);
    return orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ── Reviews ───────────────────────────────────────────────────────────────

  addReview(params: {
    listingId: string;
    orderId: string;
    reviewerId: string;
    reviewerName: string;
    rating: number;
    title: string;
    body: string;
  }): Review {
    if (params.rating < 1 || params.rating > 5) throw new Error('Rating must be between 1 and 5');

    const review: Review = {
      id: uuidv4(),
      ...params,
      helpful: 0,
      createdAt: new Date(),
    };
    this.reviews.push(review);

    // Update listing rating
    const listing = this.listings.get(params.listingId);
    if (listing) {
      const listingReviews = this.reviews.filter(r => r.listingId === params.listingId);
      listing.rating = listingReviews.reduce((sum, r) => sum + r.rating, 0) / listingReviews.length;
      listing.reviewCount = listingReviews.length;
      listing.updatedAt = new Date();
    }

    logger.info({ reviewId: review.id, listingId: params.listingId, rating: params.rating }, 'Review added');
    return review;
  }

  getReviews(listingId?: string, limit = 20): Review[] {
    let reviews = listingId ? this.reviews.filter(r => r.listingId === listingId) : [...this.reviews];
    return reviews.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  }

  markReviewHelpful(reviewId: string): Review | undefined {
    const review = this.reviews.find(r => r.id === reviewId);
    if (review) review.helpful++;
    return review;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats(): MarketplaceStats {
    const listings = Array.from(this.listings.values());
    const orders = Array.from(this.orders.values());
    const completedOrders = orders.filter(o => o.status === 'completed');

    // Category breakdown
    const categoryMap = new Map<ListingCategory, number>();
    for (const l of listings.filter(l => l.status === 'active')) {
      categoryMap.set(l.category, (categoryMap.get(l.category) ?? 0) + 1);
    }
    const topCategories = Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top sellers
    const sellerMap = new Map<string, { sellerName: string; sales: number }>();
    for (const o of completedOrders) {
      const existing = sellerMap.get(o.sellerId);
      if (existing) {
        existing.sales += o.quantity;
      } else {
        const listing = this.listings.get(o.listingId);
        sellerMap.set(o.sellerId, { sellerName: listing?.sellerName ?? o.sellerId, sales: o.quantity });
      }
    }
    const topSellers = Array.from(sellerMap.entries())
      .map(([sellerId, { sellerName, sales }]) => ({ sellerId, sellerName, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    const avgRating = this.reviews.length > 0
      ? this.reviews.reduce((sum, r) => sum + r.rating, 0) / this.reviews.length
      : 0;

    return {
      totalListings: listings.length,
      activeListings: listings.filter(l => l.status === 'active').length,
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      totalRevenue,
      totalReviews: this.reviews.length,
      averageRating: avgRating,
      topCategories,
      topSellers,
    };
  }

  // ── Seed Data ─────────────────────────────────────────────────────────────

  private seedListings(): void {
    const seeds = [
      {
        title: 'Trancendos Agent Template Pack',
        description: 'A complete starter template for building Trancendos-compatible AI agents. Includes TypeScript boilerplate, Express API setup, pino logging, and zero-cost compliance patterns.',
        category: 'template' as ListingCategory,
        sellerId: 'trancendos-core',
        sellerName: 'Trancendos Core',
        price: 0,
        currency: 'USD' as Currency,
        tags: ['template', 'agent', 'typescript', 'zero-cost'],
      },
      {
        title: 'Mesh Integration Guide',
        description: 'Comprehensive guide for integrating new services into the Trancendos mesh. Covers service discovery, health checks, SLA monitoring, and inter-agent communication.',
        category: 'data' as ListingCategory,
        sellerId: 'trancendos-core',
        sellerName: 'Trancendos Core',
        price: 0,
        currency: 'USD' as Currency,
        tags: ['guide', 'integration', 'mesh', 'documentation'],
      },
      {
        title: 'Arcadia Community Membership',
        description: 'Full access to the Arcadia community platform. Includes marketplace access, community forums, early access to new features, and priority support.',
        category: 'subscription' as ListingCategory,
        sellerId: 'arcadia-platform',
        sellerName: 'Arcadia Platform',
        price: 0,
        currency: 'ARC' as Currency,
        tags: ['membership', 'community', 'access'],
      },
    ];

    for (const seed of seeds) {
      this.createListing(seed);
    }
    logger.info({ count: seeds.length }, 'Marketplace seeded with default listings');
  }
}