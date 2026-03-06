/**
 * Arcadia — REST API Server
 *
 * Exposes community platform and marketplace endpoints for the
 * Trancendos ecosystem.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { MarketplaceEngine, ListingCategory, ListingStatus, OrderStatus, Currency } from '../marketplace/marketplace-engine';
import { CommunityEngine, MemberRole, MemberStatus, PostCategory, PostStatus, EventType, EventStatus } from '../community/community-engine';
import { logger } from '../utils/logger';

// ── Bootstrap ──────────────────────────────────────────────────────────────

const app = express();
export const marketplace = new MarketplaceEngine();
export const community = new CommunityEngine();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('combined', {
  stream: { write: (msg: string) => logger.info(msg.trim()) },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data, timestamp: new Date().toISOString() });
}

function fail(res: Response, message: string, status = 400): void {
  res.status(status).json({ success: false, error: message, timestamp: new Date().toISOString() });
}

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

// ── Health ─────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  const mStats = marketplace.getStats();
  const cStats = community.getStats();
  ok(res, {
    status: 'healthy',
    service: 'arcadia',
    uptime: process.uptime(),
    marketplace: { activeListings: mStats.activeListings, totalOrders: mStats.totalOrders },
    community: { activeMembers: cStats.activeMembers, publishedPosts: cStats.publishedPosts },
  });
});

app.get('/metrics', (_req, res) => {
  ok(res, {
    marketplace: marketplace.getStats(),
    community: community.getStats(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
  });
});

// ── Marketplace: Listings ──────────────────────────────────────────────────

app.get('/marketplace/listings', (req, res) => {
  const { category, status, sellerId, minPrice, maxPrice, currency, tags, search, limit } = req.query;
  const listings = marketplace.getListings({
    category: category as ListingCategory | undefined,
    status: status as ListingStatus | undefined,
    sellerId: sellerId as string | undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    currency: currency as Currency | undefined,
    tags: tags ? (tags as string).split(',') : undefined,
    search: search as string | undefined,
    limit: limit ? Number(limit) : undefined,
  });
  ok(res, { listings, count: listings.length });
});

app.get('/marketplace/listings/:id', (req, res) => {
  const listing = marketplace.getListing(req.params.id);
  if (!listing) return fail(res, 'Listing not found', 404);
  ok(res, listing);
});

app.post('/marketplace/listings', (req, res) => {
  const { title, description, category, sellerId, sellerName, price, currency, tags, images, inventory, expiresAt } = req.body;
  if (!title || !description || !category || !sellerId || !sellerName || price === undefined) {
    return fail(res, 'title, description, category, sellerId, sellerName, price are required');
  }
  const validCategories: ListingCategory[] = ['digital_asset', 'service', 'template', 'plugin', 'data', 'nft', 'subscription', 'other'];
  if (!validCategories.includes(category)) {
    return fail(res, `category must be one of: ${validCategories.join(', ')}`);
  }
  try {
    const listing = marketplace.createListing({
      title, description, category, sellerId, sellerName,
      price: Number(price), currency, tags, images,
      inventory: inventory ? Number(inventory) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    ok(res, listing, 201);
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

app.patch('/marketplace/listings/:id', (req, res) => {
  const { title, description, price, status, tags, images, inventory } = req.body;
  const listing = marketplace.updateListing(req.params.id, { title, description, price, status, tags, images, inventory });
  if (!listing) return fail(res, 'Listing not found', 404);
  ok(res, listing);
});

app.delete('/marketplace/listings/:id', (req, res) => {
  const removed = marketplace.removeListing(req.params.id);
  if (!removed) return fail(res, 'Listing not found', 404);
  ok(res, { removed: true, id: req.params.id });
});

// ── Marketplace: Orders ────────────────────────────────────────────────────

app.get('/marketplace/orders', (req, res) => {
  const { buyerId, sellerId, listingId, status } = req.query;
  const orders = marketplace.getOrders({
    buyerId: buyerId as string | undefined,
    sellerId: sellerId as string | undefined,
    listingId: listingId as string | undefined,
    status: status as OrderStatus | undefined,
  });
  ok(res, { orders, count: orders.length });
});

app.get('/marketplace/orders/:id', (req, res) => {
  const order = marketplace.getOrder(req.params.id);
  if (!order) return fail(res, 'Order not found', 404);
  ok(res, order);
});

app.post('/marketplace/orders', (req, res) => {
  const { listingId, buyerId, quantity, notes } = req.body;
  if (!listingId || !buyerId) return fail(res, 'listingId, buyerId are required');
  try {
    const order = marketplace.createOrder({ listingId, buyerId, quantity, notes });
    ok(res, order, 201);
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

app.patch('/marketplace/orders/:id/status', (req, res) => {
  const { status } = req.body;
  if (!status) return fail(res, 'status is required');
  const validStatuses: OrderStatus[] = ['pending', 'confirmed', 'processing', 'completed', 'cancelled', 'refunded'];
  if (!validStatuses.includes(status)) {
    return fail(res, `status must be one of: ${validStatuses.join(', ')}`);
  }
  const order = marketplace.updateOrderStatus(req.params.id, status as OrderStatus);
  if (!order) return fail(res, 'Order not found', 404);
  ok(res, order);
});

// ── Marketplace: Reviews ───────────────────────────────────────────────────

app.get('/marketplace/reviews', (req, res) => {
  const { listingId, limit } = req.query;
  const reviews = marketplace.getReviews(listingId as string | undefined, limit ? Number(limit) : 20);
  ok(res, { reviews, count: reviews.length });
});

app.post('/marketplace/reviews', (req, res) => {
  const { listingId, orderId, reviewerId, reviewerName, rating, title, body } = req.body;
  if (!listingId || !orderId || !reviewerId || !reviewerName || !rating || !title || !body) {
    return fail(res, 'listingId, orderId, reviewerId, reviewerName, rating, title, body are required');
  }
  try {
    const review = marketplace.addReview({ listingId, orderId, reviewerId, reviewerName, rating: Number(rating), title, body });
    ok(res, review, 201);
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

app.patch('/marketplace/reviews/:id/helpful', (req, res) => {
  const review = marketplace.markReviewHelpful(req.params.id);
  if (!review) return fail(res, 'Review not found', 404);
  ok(res, review);
});

// ── Marketplace: Stats ─────────────────────────────────────────────────────

app.get('/marketplace/stats', (_req, res) => {
  ok(res, marketplace.getStats());
});

// ── Community: Members ─────────────────────────────────────────────────────

app.get('/community/members', (req, res) => {
  const { role, status, search, limit } = req.query;
  const members = community.getMembers({
    role: role as MemberRole | undefined,
    status: status as MemberStatus | undefined,
    search: search as string | undefined,
    limit: limit ? Number(limit) : undefined,
  });
  ok(res, { members, count: members.length });
});

app.get('/community/members/:id', (req, res) => {
  const member = community.getMember(req.params.id);
  if (!member) return fail(res, 'Member not found', 404);
  ok(res, member);
});

app.post('/community/members', (req, res) => {
  const { username, displayName, role, bio, avatarUrl, tags } = req.body;
  if (!username || !displayName) return fail(res, 'username, displayName are required');
  try {
    const member = community.registerMember({ username, displayName, role, bio, avatarUrl, tags });
    ok(res, member, 201);
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

app.patch('/community/members/:id/status', (req, res) => {
  const { status } = req.body;
  if (!status) return fail(res, 'status is required');
  const member = community.updateMemberStatus(req.params.id, status as MemberStatus);
  if (!member) return fail(res, 'Member not found', 404);
  ok(res, member);
});

// ── Community: Posts ───────────────────────────────────────────────────────

app.get('/community/posts', (req, res) => {
  const { category, status, authorId, tags, search, limit } = req.query;
  const posts = community.getPosts({
    category: category as PostCategory | undefined,
    status: status as PostStatus | undefined,
    authorId: authorId as string | undefined,
    tags: tags ? (tags as string).split(',') : undefined,
    search: search as string | undefined,
    limit: limit ? Number(limit) : undefined,
  });
  ok(res, { posts, count: posts.length });
});

app.get('/community/posts/:id', (req, res) => {
  const post = community.getPost(req.params.id);
  if (!post) return fail(res, 'Post not found', 404);
  ok(res, post);
});

app.post('/community/posts', (req, res) => {
  const { title, body, category, authorId, authorName, tags, isPinned } = req.body;
  if (!title || !body || !category || !authorId || !authorName) {
    return fail(res, 'title, body, category, authorId, authorName are required');
  }
  const validCategories: PostCategory[] = ['announcement', 'discussion', 'showcase', 'help', 'feedback', 'news'];
  if (!validCategories.includes(category)) {
    return fail(res, `category must be one of: ${validCategories.join(', ')}`);
  }
  try {
    const post = community.createPost({ title, body, category, authorId, authorName, tags, isPinned });
    ok(res, post, 201);
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

app.patch('/community/posts/:id/like', (req, res) => {
  const post = community.likePost(req.params.id);
  if (!post) return fail(res, 'Post not found', 404);
  ok(res, post);
});

app.patch('/community/posts/:id/status', (req, res) => {
  const { status } = req.body;
  if (!status) return fail(res, 'status is required');
  const post = community.updatePostStatus(req.params.id, status as PostStatus);
  if (!post) return fail(res, 'Post not found', 404);
  ok(res, post);
});

// ── Community: Comments ────────────────────────────────────────────────────

app.get('/community/posts/:id/comments', (req, res) => {
  const comments = community.getComments(req.params.id);
  ok(res, { comments, count: comments.length });
});

app.post('/community/posts/:id/comments', (req, res) => {
  const { authorId, authorName, body, parentId } = req.body;
  if (!authorId || !authorName || !body) {
    return fail(res, 'authorId, authorName, body are required');
  }
  try {
    const comment = community.addComment({ postId: req.params.id, authorId, authorName, body, parentId });
    ok(res, comment, 201);
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

app.patch('/community/comments/:id/like', (req, res) => {
  const comment = community.likeComment(req.params.id);
  if (!comment) return fail(res, 'Comment not found', 404);
  ok(res, comment);
});

// ── Community: Events ──────────────────────────────────────────────────────

app.get('/community/events', (req, res) => {
  const { type, status, limit } = req.query;
  const events = community.getEvents({
    type: type as EventType | undefined,
    status: status as EventStatus | undefined,
    limit: limit ? Number(limit) : undefined,
  });
  ok(res, { events, count: events.length });
});

app.get('/community/events/:id', (req, res) => {
  const event = community.getEvent(req.params.id);
  if (!event) return fail(res, 'Event not found', 404);
  ok(res, event);
});

app.post('/community/events', (req, res) => {
  const { title, description, type, organizerId, organizerName, startAt, endAt, url, maxAttendees, tags } = req.body;
  if (!title || !description || !type || !organizerId || !organizerName || !startAt || !endAt) {
    return fail(res, 'title, description, type, organizerId, organizerName, startAt, endAt are required');
  }
  const validTypes: EventType[] = ['webinar', 'hackathon', 'meetup', 'launch', 'maintenance', 'other'];
  if (!validTypes.includes(type)) {
    return fail(res, `type must be one of: ${validTypes.join(', ')}`);
  }
  try {
    const event = community.createEvent({
      title, description, type, organizerId, organizerName,
      startAt: new Date(startAt), endAt: new Date(endAt),
      url, maxAttendees, tags,
    });
    ok(res, event, 201);
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

app.post('/community/events/:id/rsvp', (req, res) => {
  try {
    const event = community.rsvpEvent(req.params.id);
    if (!event) return fail(res, 'Event not found', 404);
    ok(res, event);
  } catch (err) {
    fail(res, (err as Error).message);
  }
});

app.patch('/community/events/:id/status', (req, res) => {
  const { status } = req.body;
  if (!status) return fail(res, 'status is required');
  const event = community.updateEventStatus(req.params.id, status as EventStatus);
  if (!event) return fail(res, 'Event not found', 404);
  ok(res, event);
});

// ── Community: Stats ───────────────────────────────────────────────────────

app.get('/community/stats', (_req, res) => {
  ok(res, community.getStats());
});

// ── Combined Stats ─────────────────────────────────────────────────────────

app.get('/stats', (_req, res) => {
  ok(res, {
    marketplace: marketplace.getStats(),
    community: community.getStats(),
  });
});

// ── Error Handler ──────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  fail(res, err.message || 'Internal server error', 500);
});

export { app };