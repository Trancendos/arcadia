/**
 * Arcadia — Community Engine
 *
 * Community platform features: members, posts, events, and announcements.
 * Zero-cost compliant — no LLM calls, all rule-based logic.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────

export type MemberRole = 'member' | 'contributor' | 'moderator' | 'admin' | 'agent';
export type MemberStatus = 'active' | 'inactive' | 'suspended' | 'pending';
export type PostCategory = 'announcement' | 'discussion' | 'showcase' | 'help' | 'feedback' | 'news';
export type PostStatus = 'published' | 'draft' | 'pinned' | 'archived' | 'removed';
export type EventType = 'webinar' | 'hackathon' | 'meetup' | 'launch' | 'maintenance' | 'other';
export type EventStatus = 'upcoming' | 'live' | 'completed' | 'cancelled';

export interface Member {
  id: string;
  username: string;
  displayName: string;
  role: MemberRole;
  status: MemberStatus;
  bio?: string;
  avatarUrl?: string;
  tags: string[];
  reputation: number;
  postCount: number;
  joinedAt: Date;
  lastActiveAt: Date;
}

export interface Post {
  id: string;
  title: string;
  body: string;
  category: PostCategory;
  status: PostStatus;
  authorId: string;
  authorName: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  body: string;
  likeCount: number;
  parentId?: string;   // for nested replies
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  type: EventType;
  status: EventStatus;
  organizerId: string;
  organizerName: string;
  startAt: Date;
  endAt: Date;
  url?: string;
  maxAttendees?: number;
  attendeeCount: number;
  tags: string[];
  createdAt: Date;
}

export interface CommunityStats {
  totalMembers: number;
  activeMembers: number;
  totalPosts: number;
  publishedPosts: number;
  totalComments: number;
  totalEvents: number;
  upcomingEvents: number;
  topContributors: Array<{ memberId: string; username: string; reputation: number }>;
}

// ── Engine ─────────────────────────────────────────────────────────────────

export class CommunityEngine {
  private members: Map<string, Member> = new Map();
  private posts: Map<string, Post> = new Map();
  private comments: Comment[] = [];
  private events: Map<string, CommunityEvent> = new Map();

  constructor() {
    this.seedCommunity();
    logger.info('CommunityEngine initialized');
  }

  // ── Members ───────────────────────────────────────────────────────────────

  registerMember(params: {
    username: string;
    displayName: string;
    role?: MemberRole;
    bio?: string;
    avatarUrl?: string;
    tags?: string[];
  }): Member {
    const existing = Array.from(this.members.values()).find(m => m.username === params.username);
    if (existing) throw new Error(`Username '${params.username}' already taken`);

    const member: Member = {
      id: uuidv4(),
      username: params.username,
      displayName: params.displayName,
      role: params.role ?? 'member',
      status: 'active',
      bio: params.bio,
      avatarUrl: params.avatarUrl,
      tags: params.tags ?? [],
      reputation: 0,
      postCount: 0,
      joinedAt: new Date(),
      lastActiveAt: new Date(),
    };
    this.members.set(member.id, member);
    logger.info({ memberId: member.id, username: member.username }, 'Member registered');
    return member;
  }

  getMember(memberId: string): Member | undefined {
    return this.members.get(memberId);
  }

  getMemberByUsername(username: string): Member | undefined {
    return Array.from(this.members.values()).find(m => m.username === username);
  }

  getMembers(filters?: {
    role?: MemberRole;
    status?: MemberStatus;
    search?: string;
    limit?: number;
  }): Member[] {
    let members = Array.from(this.members.values());
    if (filters?.role) members = members.filter(m => m.role === filters.role);
    if (filters?.status) members = members.filter(m => m.status === filters.status);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      members = members.filter(m =>
        m.username.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q) ||
        (m.bio ?? '').toLowerCase().includes(q)
      );
    }
    members.sort((a, b) => b.reputation - a.reputation);
    if (filters?.limit) members = members.slice(0, filters.limit);
    return members;
  }

  updateMemberStatus(memberId: string, status: MemberStatus): Member | undefined {
    const member = this.members.get(memberId);
    if (!member) return undefined;
    member.status = status;
    member.lastActiveAt = new Date();
    return member;
  }

  addReputation(memberId: string, points: number): Member | undefined {
    const member = this.members.get(memberId);
    if (!member) return undefined;
    member.reputation = Math.max(0, member.reputation + points);
    return member;
  }

  // ── Posts ─────────────────────────────────────────────────────────────────

  createPost(params: {
    title: string;
    body: string;
    category: PostCategory;
    authorId: string;
    authorName: string;
    tags?: string[];
    isPinned?: boolean;
  }): Post {
    const post: Post = {
      id: uuidv4(),
      title: params.title,
      body: params.body,
      category: params.category,
      status: params.isPinned ? 'pinned' : 'published',
      authorId: params.authorId,
      authorName: params.authorName,
      tags: params.tags ?? [],
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
      isPinned: params.isPinned ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.posts.set(post.id, post);

    // Update author post count
    const author = this.members.get(params.authorId);
    if (author) {
      author.postCount++;
      author.lastActiveAt = new Date();
      author.reputation += 5; // +5 rep for posting
    }

    logger.info({ postId: post.id, category: post.category, authorId: post.authorId }, 'Post created');
    return post;
  }

  getPost(postId: string): Post | undefined {
    const post = this.posts.get(postId);
    if (post) {
      post.viewCount++;
      post.updatedAt = new Date();
    }
    return post;
  }

  getPosts(filters?: {
    category?: PostCategory;
    status?: PostStatus;
    authorId?: string;
    tags?: string[];
    search?: string;
    limit?: number;
  }): Post[] {
    let posts = Array.from(this.posts.values());
    if (filters?.category) posts = posts.filter(p => p.category === filters.category);
    if (filters?.status) posts = posts.filter(p => p.status === filters.status);
    if (filters?.authorId) posts = posts.filter(p => p.authorId === filters.authorId);
    if (filters?.tags?.length) {
      posts = posts.filter(p => filters.tags!.some(t => p.tags.includes(t)));
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      posts = posts.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q)
      );
    }
    // Pinned first, then by date
    posts.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    if (filters?.limit) posts = posts.slice(0, filters.limit);
    return posts;
  }

  likePost(postId: string): Post | undefined {
    const post = this.posts.get(postId);
    if (!post) return undefined;
    post.likeCount++;
    post.updatedAt = new Date();
    // Give author reputation
    const author = this.members.get(post.authorId);
    if (author) author.reputation += 1;
    return post;
  }

  updatePostStatus(postId: string, status: PostStatus): Post | undefined {
    const post = this.posts.get(postId);
    if (!post) return undefined;
    post.status = status;
    post.isPinned = status === 'pinned';
    post.updatedAt = new Date();
    return post;
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  addComment(params: {
    postId: string;
    authorId: string;
    authorName: string;
    body: string;
    parentId?: string;
  }): Comment {
    const post = this.posts.get(params.postId);
    if (!post) throw new Error(`Post ${params.postId} not found`);

    const comment: Comment = {
      id: uuidv4(),
      postId: params.postId,
      authorId: params.authorId,
      authorName: params.authorName,
      body: params.body,
      likeCount: 0,
      parentId: params.parentId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.comments.push(comment);
    post.commentCount++;
    post.updatedAt = new Date();

    // Give author reputation
    const author = this.members.get(params.authorId);
    if (author) {
      author.reputation += 2;
      author.lastActiveAt = new Date();
    }

    logger.info({ commentId: comment.id, postId: params.postId }, 'Comment added');
    return comment;
  }

  getComments(postId: string): Comment[] {
    return this.comments
      .filter(c => c.postId === postId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  likeComment(commentId: string): Comment | undefined {
    const comment = this.comments.find(c => c.id === commentId);
    if (comment) comment.likeCount++;
    return comment;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  createEvent(params: {
    title: string;
    description: string;
    type: EventType;
    organizerId: string;
    organizerName: string;
    startAt: Date;
    endAt: Date;
    url?: string;
    maxAttendees?: number;
    tags?: string[];
  }): CommunityEvent {
    const event: CommunityEvent = {
      id: uuidv4(),
      title: params.title,
      description: params.description,
      type: params.type,
      status: 'upcoming',
      organizerId: params.organizerId,
      organizerName: params.organizerName,
      startAt: params.startAt,
      endAt: params.endAt,
      url: params.url,
      maxAttendees: params.maxAttendees,
      attendeeCount: 0,
      tags: params.tags ?? [],
      createdAt: new Date(),
    };
    this.events.set(event.id, event);
    logger.info({ eventId: event.id, type: event.type }, 'Event created');
    return event;
  }

  getEvent(eventId: string): CommunityEvent | undefined {
    return this.events.get(eventId);
  }

  getEvents(filters?: {
    type?: EventType;
    status?: EventStatus;
    limit?: number;
  }): CommunityEvent[] {
    let events = Array.from(this.events.values());
    if (filters?.type) events = events.filter(e => e.type === filters.type);
    if (filters?.status) events = events.filter(e => e.status === filters.status);
    events.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    if (filters?.limit) events = events.slice(0, filters.limit);
    return events;
  }

  rsvpEvent(eventId: string): CommunityEvent | undefined {
    const event = this.events.get(eventId);
    if (!event) return undefined;
    if (event.maxAttendees !== undefined && event.attendeeCount >= event.maxAttendees) {
      throw new Error('Event is at capacity');
    }
    event.attendeeCount++;
    return event;
  }

  updateEventStatus(eventId: string, status: EventStatus): CommunityEvent | undefined {
    const event = this.events.get(eventId);
    if (!event) return undefined;
    event.status = status;
    return event;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getStats(): CommunityStats {
    const members = Array.from(this.members.values());
    const posts = Array.from(this.posts.values());
    const events = Array.from(this.events.values());

    const topContributors = members
      .filter(m => m.status === 'active')
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 5)
      .map(m => ({ memberId: m.id, username: m.username, reputation: m.reputation }));

    return {
      totalMembers: members.length,
      activeMembers: members.filter(m => m.status === 'active').length,
      totalPosts: posts.length,
      publishedPosts: posts.filter(p => p.status === 'published' || p.status === 'pinned').length,
      totalComments: this.comments.length,
      totalEvents: events.length,
      upcomingEvents: events.filter(e => e.status === 'upcoming').length,
      topContributors,
    };
  }

  // ── Seed Data ─────────────────────────────────────────────────────────────

  private seedCommunity(): void {
    // Seed members
    const coreTeam = this.registerMember({
      username: 'trancendos-core',
      displayName: 'Trancendos Core Team',
      role: 'admin',
      bio: 'The core team behind the Trancendos Industry 6.0 platform.',
      tags: ['admin', 'core'],
    });

    const cornelius = this.registerMember({
      username: 'cornelius-ai',
      displayName: 'Cornelius AI',
      role: 'agent',
      bio: 'Orchestration agent for the Trancendos mesh.',
      tags: ['agent', 'orchestration'],
    });

    // Seed posts
    this.createPost({
      title: 'Welcome to Arcadia — Community Platform & Marketplace',
      body: `Welcome to Arcadia, the community hub of the Trancendos ecosystem!

Arcadia is your gateway to:
- **The Marketplace**: Discover and share templates, plugins, data, and services
- **Community Forums**: Connect with other builders and agents
- **Events**: Join webinars, hackathons, and community meetups
- **Announcements**: Stay up to date with the latest from Trancendos

This platform operates under the **Zero-Cost Mandate** — all core features are free and open to all mesh participants.

*— Trancendos Core Team*`,
      category: 'announcement',
      authorId: coreTeam.id,
      authorName: coreTeam.displayName,
      tags: ['welcome', 'announcement'],
      isPinned: true,
    });

    this.createPost({
      title: 'Trancendos Industry 6.0 — 2060 Architecture Overview',
      body: `The Trancendos mesh is built on the Industry 6.0 standard, designed for the 2060 horizon.

**Key Principles:**
1. **Zero-Cost Mandate**: All operations must be achievable at $0 cost
2. **Mesh Architecture**: 50 independent services communicating via REST
3. **Agent Autonomy**: Each agent operates independently with its own domain
4. **Resilience**: Graceful degradation, SLA monitoring, and self-healing

**Current Mesh Services:**
- Cornelius AI (orchestration), Norman AI (security), The Dr AI (healing)
- Guardian AI (protection), Dorris AI (financial)
- The Hive, Workshop, Observatory, Library, Citadel, Agora, Nexus, Treasury
- Oracle AI, Prometheus AI, Queen AI, Sentinel AI, Renik AI
- Porter Family AI, Solarscene AI, Serenity AI

Join the discussion below!`,
      category: 'discussion',
      authorId: cornelius.id,
      authorName: cornelius.displayName,
      tags: ['architecture', '2060', 'mesh', 'industry-6.0'],
    });

    logger.info('Community seeded with default members and posts');
  }
}