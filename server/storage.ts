import { 
  type User, type InsertUser, type Track, type InsertTrack, 
  type Profile, type InsertProfile, type Post, type InsertPost,
  type Follow, type InsertFollow, type Reaction, type InsertReaction,
  type Comment, type InsertComment, type Share, type InsertShare,
  type Playlist, type InsertPlaylist, type PlaylistTrack, type InsertPlaylistTrack,
  type Notification, type InsertNotification,
  users, tracks, profiles, posts, follows, reactions, comments, shares, playlists, playlistTracks, notifications
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, or, isNull, desc, inArray, sql } from "drizzle-orm";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: any): Promise<User>;
  checkUsernameAvailability(username: string, excludeUserId?: string): Promise<boolean>;
  updateUsername(userId: string, newUsername: string): Promise<boolean>;
  
  getAllTracks(): Promise<Track[]>;
  getUserTracks(userId: string): Promise<Track[]>;
  getSharedTracks(): Promise<Track[]>;
  getTrackByVideoId(videoId: string): Promise<Track | undefined>;
  getReadyTrackByVideoId(videoId: string): Promise<Track | undefined>;
  getTrackByVideoIdForUser(videoId: string, userId: string): Promise<Track | undefined>;
  getTrackById(id: number): Promise<Track | undefined>;
  createTrack(track: InsertTrack): Promise<Track>;
  updateTrackStatusById(id: number, status: string, progress: number): Promise<void>;
  updateTrackMetadataById(id: number, title: string, channel: string, thumbnail?: string): Promise<void>;
  updateTrackShared(id: number, isShared: number): Promise<void>;
  deleteTrack(id: number): Promise<void>;

  getProfile(userId: string): Promise<Profile | undefined>;
  getProfileById(id: number): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile): Promise<Profile>;
  updateProfile(userId: string, updates: Partial<InsertProfile>): Promise<Profile | undefined>;
  searchProfiles(query: string): Promise<Profile[]>;

  followUser(followerId: string, followingId: string): Promise<Follow>;
  unfollowUser(followerId: string, followingId: string): Promise<void>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  getFollowers(userId: string): Promise<Profile[]>;
  getFollowing(userId: string): Promise<Profile[]>;

  createPost(post: InsertPost): Promise<Post>;
  getPostById(id: number): Promise<Post | undefined>;
  getUserPosts(userId: string): Promise<Post[]>;
  getFeed(userId: string): Promise<Post[]>;
  deletePost(id: number): Promise<void>;
  isVideoIdAlreadyShared(videoId: string): Promise<boolean>;

  addReaction(reaction: InsertReaction): Promise<Reaction>;
  removeReaction(postId: number, userId: string): Promise<void>;
  getReaction(postId: number, userId: string): Promise<Reaction | undefined>;
  getPostReactions(postId: number): Promise<Reaction[]>;

  createComment(comment: InsertComment): Promise<Comment>;
  getPostComments(postId: number): Promise<Comment[]>;
  deleteComment(id: number): Promise<void>;

  hasUserSharedPost(postId: number, userId: string): Promise<boolean>;
  createShare(share: InsertShare): Promise<Share | null>;
  getPostShares(postId: number): Promise<Share[]>;

  createPlaylist(playlist: InsertPlaylist): Promise<Playlist>;
  getPlaylist(id: number): Promise<Playlist | undefined>;
  getUserPlaylists(userId: string): Promise<Playlist[]>;
  updatePlaylist(id: number, updates: Partial<InsertPlaylist>): Promise<Playlist | undefined>;
  deletePlaylist(id: number): Promise<void>;
  addTrackToPlaylist(playlistId: number, trackId: number): Promise<PlaylistTrack>;
  removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<void>;
  getPlaylistTracks(playlistId: number): Promise<Track[]>;
  getPlaylistTracksWithDetails(playlistId: number): Promise<{ id: number; playlistId: number; trackId: number; position: number; addedAt: Date; track: Track }[]>;
  reorderPlaylistTrack(playlistId: number, trackId: number, newPosition: number): Promise<void>;

  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string): Promise<Notification[]>;
  markNotificationRead(id: number): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  
  getRecommendations(userId: string, limit?: number): Promise<Track[]>;
  getTrendingTracks(limit?: number, excludeUserId?: string): Promise<{ track: Track; score: number; userCount: number }[]>;
  getTrendingByChannel(limit?: number, excludeUserId?: string): Promise<{ channel: string; tracks: { track: Track; score: number }[] }[]>;
  
  getArtists(limit?: number): Promise<{ name: string; trackCount: number; thumbnail?: string }[]>;
  getArtistTracks(artistName: string): Promise<Track[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async upsertUser(userData: any): Promise<User> {
    const existingUser = await this.getUser(userData.id);
    
    if (existingUser) {
      return existingUser;
    }
    
    const uniqueUsername = `user_${userData.id.substring(0, 8)}_${Date.now().toString(36)}`;
    
    const result = await db
      .insert(users)
      .values({
        id: userData.id,
        username: uniqueUsername,
        password: '',
        email: userData.email,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { updatedAt: new Date() },
      })
      .returning();
    
    return result[0];
  }

  async checkUsernameAvailability(username: string, excludeUserId?: string): Promise<boolean> {
    const normalizedUsername = username.toLowerCase();
    const result = await db.select({ id: users.id })
      .from(users)
      .where(sql`LOWER(${users.username}) = ${normalizedUsername}`);
    
    if (result.length === 0) return true;
    if (excludeUserId && result[0].id === excludeUserId) return true;
    return false;
  }

  async updateUsername(userId: string, newUsername: string): Promise<boolean> {
    const isAvailable = await this.checkUsernameAvailability(newUsername, userId);
    if (!isAvailable) return false;
    
    const normalizedUsername = newUsername.toLowerCase();
    
    try {
      const userResult = await db.update(users)
        .set({ username: normalizedUsername, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      
      if (userResult.length === 0) {
        return false;
      }
      
      await db.update(profiles)
        .set({ username: normalizedUsername, updatedAt: new Date() })
        .where(eq(profiles.userId, userId));
      
      return true;
    } catch (error) {
      console.error("Error updating username:", error);
      return false;
    }
  }

  async getAllTracks(): Promise<Track[]> {
    return await db.select().from(tracks).orderBy(desc(tracks.addedAt));
  }

  async getUserTracks(userId: string): Promise<Track[]> {
    return await db.select().from(tracks)
      .where(eq(tracks.userId, userId))
      .orderBy(desc(tracks.addedAt));
  }

  async getSharedTracks(): Promise<Track[]> {
    return await db.select().from(tracks)
      .where(or(
        eq(tracks.isShared, 1),
        isNull(tracks.userId)
      ))
      .orderBy(desc(tracks.addedAt));
  }

  async getTrackByVideoId(videoId: string): Promise<Track | undefined> {
    const result = await db.select().from(tracks).where(eq(tracks.videoId, videoId));
    return result[0];
  }

  async getReadyTrackByVideoId(videoId: string): Promise<Track | undefined> {
    const result = await db.select().from(tracks)
      .where(and(eq(tracks.videoId, videoId), eq(tracks.status, "ready")))
      .limit(1);
    return result[0];
  }

  async getTrackByVideoIdForUser(videoId: string, userId: string): Promise<Track | undefined> {
    const result = await db.select().from(tracks)
      .where(and(eq(tracks.videoId, videoId), eq(tracks.userId, userId)));
    return result[0];
  }

  async createTrack(track: InsertTrack): Promise<Track> {
    const result = await db.insert(tracks).values(track).returning();
    return result[0];
  }

  async updateTrackStatusById(id: number, status: string, progress: number): Promise<void> {
    await db.update(tracks)
      .set({ status, progress })
      .where(eq(tracks.id, id));
  }

  async updateTrackMetadataById(id: number, title: string, channel: string, thumbnail?: string): Promise<void> {
    const updateData: any = { title, channel };
    if (thumbnail) {
      updateData.thumbnail = thumbnail;
    }
    await db.update(tracks)
      .set(updateData)
      .where(eq(tracks.id, id));
  }

  async updateTrackShared(id: number, isShared: number): Promise<void> {
    await db.update(tracks)
      .set({ isShared })
      .where(eq(tracks.id, id));
  }

  async getTrackById(id: number): Promise<Track | undefined> {
    const result = await db.select().from(tracks).where(eq(tracks.id, id));
    return result[0];
  }

  async deleteTrack(id: number): Promise<void> {
    await db.delete(tracks).where(eq(tracks.id, id));
  }

  async getProfile(userId: string): Promise<Profile | undefined> {
    const result = await db.select().from(profiles).where(eq(profiles.userId, userId));
    return result[0];
  }

  async getProfileById(id: number): Promise<Profile | undefined> {
    const result = await db.select().from(profiles).where(eq(profiles.id, id));
    return result[0];
  }

  async createProfile(profile: InsertProfile): Promise<Profile> {
    const result = await db.insert(profiles).values(profile).returning();
    return result[0];
  }

  async updateProfile(userId: string, updates: Partial<InsertProfile>): Promise<Profile | undefined> {
    const result = await db.update(profiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning();
    return result[0];
  }

  async searchProfiles(query: string): Promise<Profile[]> {
    return await db.select().from(profiles)
      .where(or(
        sql`${profiles.username} ILIKE ${`%${query}%`}`,
        sql`${profiles.displayName} ILIKE ${`%${query}%`}`
      ))
      .limit(20);
  }

  async followUser(followerId: string, followingId: string): Promise<Follow> {
    const result = await db.insert(follows)
      .values({ followerId, followingId })
      .returning();
    
    await db.update(profiles)
      .set({ followingCount: sql`${profiles.followingCount} + 1` })
      .where(eq(profiles.userId, followerId));
    
    await db.update(profiles)
      .set({ followersCount: sql`${profiles.followersCount} + 1` })
      .where(eq(profiles.userId, followingId));
    
    return result[0];
  }

  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    await db.delete(follows)
      .where(and(
        eq(follows.followerId, followerId),
        eq(follows.followingId, followingId)
      ));
    
    await db.update(profiles)
      .set({ followingCount: sql`GREATEST(${profiles.followingCount} - 1, 0)` })
      .where(eq(profiles.userId, followerId));
    
    await db.update(profiles)
      .set({ followersCount: sql`GREATEST(${profiles.followersCount} - 1, 0)` })
      .where(eq(profiles.userId, followingId));
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const result = await db.select().from(follows)
      .where(and(
        eq(follows.followerId, followerId),
        eq(follows.followingId, followingId)
      ));
    return result.length > 0;
  }

  async getFollowers(userId: string): Promise<Profile[]> {
    const followerIds = await db.select({ followerId: follows.followerId })
      .from(follows)
      .where(eq(follows.followingId, userId));
    
    if (followerIds.length === 0) return [];
    
    return await db.select().from(profiles)
      .where(inArray(profiles.userId, followerIds.map(f => f.followerId)));
  }

  async getFollowing(userId: string): Promise<Profile[]> {
    const followingIds = await db.select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));
    
    if (followingIds.length === 0) return [];
    
    return await db.select().from(profiles)
      .where(inArray(profiles.userId, followingIds.map(f => f.followingId)));
  }

  async createPost(post: InsertPost): Promise<Post> {
    const result = await db.insert(posts).values(post).returning();
    
    await db.update(profiles)
      .set({ postsCount: sql`${profiles.postsCount} + 1` })
      .where(eq(profiles.userId, post.authorId));
    
    return result[0];
  }

  async getPostById(id: number): Promise<Post | undefined> {
    const result = await db.select().from(posts).where(eq(posts.id, id));
    return result[0];
  }

  async getUserPosts(userId: string): Promise<Post[]> {
    return await db.select().from(posts)
      .where(eq(posts.authorId, userId))
      .orderBy(desc(posts.createdAt));
  }

  async getFeed(userId: string): Promise<Post[]> {
    const followingIds = await db.select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));
    
    const userIds = [userId, ...followingIds.map(f => f.followingId)];
    
    return await db.select().from(posts)
      .where(inArray(posts.authorId, userIds))
      .orderBy(desc(posts.createdAt))
      .limit(50);
  }

  async deletePost(id: number): Promise<void> {
    const post = await this.getPostById(id);
    if (post) {
      await db.delete(posts).where(eq(posts.id, id));
      
      await db.update(profiles)
        .set({ postsCount: sql`GREATEST(${profiles.postsCount} - 1, 0)` })
        .where(eq(profiles.userId, post.authorId));
    }
  }

  async isVideoIdAlreadyShared(videoId: string): Promise<boolean> {
    const result = await db.select().from(tracks)
      .where(and(
        eq(tracks.videoId, videoId),
        eq(tracks.isShared, 1)
      ))
      .limit(1);
    return result.length > 0;
  }

  async addReaction(reaction: InsertReaction): Promise<Reaction> {
    const existing = await this.getReaction(reaction.postId, reaction.userId);
    if (existing) {
      if (existing.type !== reaction.type) {
        await db.update(reactions)
          .set({ type: reaction.type })
          .where(eq(reactions.id, existing.id));
        
        if (reaction.type === 'like') {
          await db.update(posts)
            .set({ 
              likesCount: sql`${posts.likesCount} + 1`,
              dislikesCount: sql`GREATEST(${posts.dislikesCount} - 1, 0)`
            })
            .where(eq(posts.id, reaction.postId));
        } else {
          await db.update(posts)
            .set({ 
              dislikesCount: sql`${posts.dislikesCount} + 1`,
              likesCount: sql`GREATEST(${posts.likesCount} - 1, 0)`
            })
            .where(eq(posts.id, reaction.postId));
        }
      }
      return existing;
    }
    
    const result = await db.insert(reactions).values(reaction).returning();
    
    if (reaction.type === 'like') {
      await db.update(posts)
        .set({ likesCount: sql`${posts.likesCount} + 1` })
        .where(eq(posts.id, reaction.postId));
    } else {
      await db.update(posts)
        .set({ dislikesCount: sql`${posts.dislikesCount} + 1` })
        .where(eq(posts.id, reaction.postId));
    }
    
    return result[0];
  }

  async removeReaction(postId: number, userId: string): Promise<void> {
    const existing = await this.getReaction(postId, userId);
    if (existing) {
      await db.delete(reactions)
        .where(and(
          eq(reactions.postId, postId),
          eq(reactions.userId, userId)
        ));
      
      if (existing.type === 'like') {
        await db.update(posts)
          .set({ likesCount: sql`GREATEST(${posts.likesCount} - 1, 0)` })
          .where(eq(posts.id, postId));
      } else {
        await db.update(posts)
          .set({ dislikesCount: sql`GREATEST(${posts.dislikesCount} - 1, 0)` })
          .where(eq(posts.id, postId));
      }
    }
  }

  async getReaction(postId: number, userId: string): Promise<Reaction | undefined> {
    const result = await db.select().from(reactions)
      .where(and(
        eq(reactions.postId, postId),
        eq(reactions.userId, userId)
      ));
    return result[0];
  }

  async getPostReactions(postId: number): Promise<Reaction[]> {
    return await db.select().from(reactions)
      .where(eq(reactions.postId, postId));
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const result = await db.insert(comments).values(comment).returning();
    
    await db.update(posts)
      .set({ commentsCount: sql`${posts.commentsCount} + 1` })
      .where(eq(posts.id, comment.postId));
    
    return result[0];
  }

  async getPostComments(postId: number): Promise<Comment[]> {
    return await db.select().from(comments)
      .where(eq(comments.postId, postId))
      .orderBy(desc(comments.createdAt));
  }

  async deleteComment(id: number): Promise<void> {
    const comment = await db.select().from(comments).where(eq(comments.id, id));
    if (comment[0]) {
      await db.delete(comments).where(eq(comments.id, id));
      
      await db.update(posts)
        .set({ commentsCount: sql`GREATEST(${posts.commentsCount} - 1, 0)` })
        .where(eq(posts.id, comment[0].postId));
    }
  }

  async hasUserSharedPost(postId: number, userId: string): Promise<boolean> {
    const result = await db.select().from(shares)
      .where(and(
        eq(shares.postId, postId),
        eq(shares.userId, userId)
      ));
    return result.length > 0;
  }

  async createShare(share: InsertShare): Promise<Share | null> {
    try {
      const result = await db.insert(shares).values(share)
        .onConflictDoNothing({ target: [shares.postId, shares.userId] })
        .returning();
      
      if (result.length === 0) {
        return null;
      }
      
      await db.update(posts)
        .set({ sharesCount: sql`${posts.sharesCount} + 1` })
        .where(eq(posts.id, share.postId));
      
      return result[0];
    } catch (error) {
      console.error("Error creating share:", error);
      return null;
    }
  }

  async getPostShares(postId: number): Promise<Share[]> {
    return await db.select().from(shares)
      .where(eq(shares.postId, postId));
  }

  async createPlaylist(playlist: InsertPlaylist): Promise<Playlist> {
    const result = await db.insert(playlists).values(playlist).returning();
    return result[0];
  }

  async getPlaylist(id: number): Promise<Playlist | undefined> {
    const result = await db.select().from(playlists).where(eq(playlists.id, id));
    return result[0];
  }

  async getUserPlaylists(userId: string): Promise<Playlist[]> {
    return await db.select().from(playlists)
      .where(eq(playlists.userId, userId))
      .orderBy(desc(playlists.updatedAt));
  }

  async updatePlaylist(id: number, updates: Partial<InsertPlaylist>): Promise<Playlist | undefined> {
    const result = await db.update(playlists)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(playlists.id, id))
      .returning();
    return result[0];
  }

  async deletePlaylist(id: number): Promise<void> {
    await db.delete(playlistTracks).where(eq(playlistTracks.playlistId, id));
    await db.delete(playlists).where(eq(playlists.id, id));
  }

  async addTrackToPlaylist(playlistId: number, trackId: number): Promise<PlaylistTrack> {
    const existing = await db.select().from(playlistTracks)
      .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)));
    if (existing.length > 0) return existing[0];

    const maxPosition = await db.select({ max: sql<number>`COALESCE(MAX(${playlistTracks.position}), 0)` })
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId));
    
    const newPosition = (maxPosition[0]?.max || 0) + 1;
    
    const result = await db.insert(playlistTracks)
      .values({ playlistId, trackId, position: newPosition })
      .returning();
    
    await db.update(playlists)
      .set({ trackCount: sql`${playlists.trackCount} + 1`, updatedAt: new Date() })
      .where(eq(playlists.id, playlistId));
    
    return result[0];
  }

  async removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<void> {
    await db.delete(playlistTracks)
      .where(and(
        eq(playlistTracks.playlistId, playlistId),
        eq(playlistTracks.trackId, trackId)
      ));
    
    await db.update(playlists)
      .set({ trackCount: sql`GREATEST(${playlists.trackCount} - 1, 0)`, updatedAt: new Date() })
      .where(eq(playlists.id, playlistId));
  }

  async getPlaylistTracks(playlistId: number): Promise<Track[]> {
    const playlistTrackRows = await db.select({ trackId: playlistTracks.trackId })
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(playlistTracks.position);
    
    if (playlistTrackRows.length === 0) return [];
    
    const trackIds = playlistTrackRows.map(pt => pt.trackId);
    const trackResults = await db.select().from(tracks)
      .where(inArray(tracks.id, trackIds));
    
    const trackMap = new Map(trackResults.map(t => [t.id, t]));
    return trackIds.map(id => trackMap.get(id)).filter((t): t is Track => t !== undefined);
  }

  async getPlaylistTracksWithDetails(playlistId: number): Promise<{ id: number; playlistId: number; trackId: number; position: number; addedAt: Date; track: Track }[]> {
    const playlistTrackRows = await db.select()
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(playlistTracks.position);
    
    if (playlistTrackRows.length === 0) return [];
    
    const trackIds = playlistTrackRows.map(pt => pt.trackId);
    const trackResults = await db.select().from(tracks)
      .where(inArray(tracks.id, trackIds));
    
    const trackMap = new Map(trackResults.map(t => [t.id, t]));
    
    return playlistTrackRows
      .map(pt => {
        const track = trackMap.get(pt.trackId);
        if (!track) return null;
        return {
          id: pt.id,
          playlistId: pt.playlistId,
          trackId: pt.trackId,
          position: pt.position,
          addedAt: pt.addedAt,
          track
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  async reorderPlaylistTrack(playlistId: number, trackId: number, newPosition: number): Promise<void> {
    await db.update(playlistTracks)
      .set({ position: newPosition })
      .where(and(
        eq(playlistTracks.playlistId, playlistId),
        eq(playlistTracks.trackId, trackId)
      ));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const result = await db.insert(notifications).values(notification).returning();
    return result[0];
  }

  async getUserNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async markNotificationRead(id: number): Promise<void> {
    await db.update(notifications)
      .set({ isRead: 1 })
      .where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: 1 })
      .where(eq(notifications.userId, userId));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`COUNT(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, 0)));
    return result[0]?.count || 0;
  }

  async getRecommendations(userId: string, limit: number = 20): Promise<Track[]> {
    const userTracks = await db.select().from(tracks)
      .where(eq(tracks.userId, userId));
    
    if (userTracks.length === 0) {
      const sharedTracks = await db.select().from(tracks)
        .where(and(eq(tracks.isShared, 1), eq(tracks.status, "ready")))
        .orderBy(desc(tracks.addedAt))
        .limit(limit);
      return sharedTracks;
    }
    
    const userChannels = [...new Set(userTracks.map(t => t.channel.toLowerCase()))];
    const userVideoIds = new Set(userTracks.map(t => t.videoId));
    
    const allShared = await db.select().from(tracks)
      .where(and(eq(tracks.isShared, 1), eq(tracks.status, "ready")));
    
    const scored = allShared
      .filter(t => !userVideoIds.has(t.videoId))
      .map(t => {
        let score = 0;
        const trackChannel = t.channel.toLowerCase();
        if (userChannels.includes(trackChannel)) {
          score += 10;
        }
        userChannels.forEach(ch => {
          if (trackChannel.includes(ch) || ch.includes(trackChannel)) {
            score += 5;
          }
        });
        return { track: t, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    if (scored.length < limit) {
      const recommended = scored.map(s => s.track);
      const recommendedIds = new Set(recommended.map(t => t.videoId));
      const filler = allShared
        .filter(t => !userVideoIds.has(t.videoId) && !recommendedIds.has(t.videoId))
        .slice(0, limit - scored.length);
      return [...recommended, ...filler];
    }
    
    return scored.map(s => s.track);
  }

  async getTrendingTracks(limit: number = 20, excludeUserId?: string): Promise<{ track: Track; score: number; userCount: number }[]> {
    let userVideoIds: Set<string> = new Set();
    let userChannels: Set<string> = new Set();
    
    if (excludeUserId) {
      const userTracks = await db.select().from(tracks)
        .where(eq(tracks.userId, excludeUserId));
      
      userVideoIds = new Set(userTracks.map(t => t.videoId));
      userChannels = new Set(userTracks.map(t => this.normalizeChannelName(t.channel)));
    }
    
    const sharedTracks = await db.select().from(tracks)
      .where(and(
        eq(tracks.status, "ready"),
        or(eq(tracks.isShared, 1), isNull(tracks.userId))
      ));
    
    if (sharedTracks.length === 0) {
      return [];
    }

    const trackScores: Map<string, { track: Track; score: number; userCount: number }> = new Map();

    for (const track of sharedTracks) {
      if (userVideoIds.has(track.videoId)) {
        continue;
      }
      
      const existing = trackScores.get(track.videoId);
      if (existing) {
        existing.userCount++;
        existing.score += 5;
      } else {
        let baseScore = 10;
        
        if (excludeUserId && userChannels.has(this.normalizeChannelName(track.channel))) {
          baseScore += 20;
        }
        
        trackScores.set(track.videoId, { track, score: baseScore, userCount: 1 });
      }
    }

    const allPosts = await db.select({
      trackId: posts.trackId,
      likesCount: posts.likesCount,
      sharesCount: posts.sharesCount,
      commentsCount: posts.commentsCount
    }).from(posts)
      .where(sql`${posts.trackId} IS NOT NULL`);
    
    const trackIdToVideoId: Map<number, string> = new Map();
    for (const track of sharedTracks) {
      trackIdToVideoId.set(track.id, track.videoId);
    }
    
    for (const post of allPosts) {
      if (post.trackId) {
        const videoId = trackIdToVideoId.get(post.trackId);
        if (videoId) {
          const existing = trackScores.get(videoId);
          if (existing) {
            existing.score += post.likesCount * 3;
            existing.score += post.sharesCount * 5;
            existing.score += post.commentsCount * 2;
          }
        }
      }
    }

    const sorted = Array.from(trackScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return sorted;
  }

  async getTrendingByChannel(limit: number = 5, excludeUserId?: string): Promise<{ channel: string; tracks: { track: Track; score: number }[] }[]> {
    const allTrending = await this.getTrendingTracks(100, excludeUserId);

    const channelMap: Map<string, { track: Track; score: number }[]> = new Map();

    for (const item of allTrending) {
      const channelName = item.track.channel;
      const normalizedChannel = this.normalizeChannelName(channelName);
      
      if (!channelMap.has(normalizedChannel)) {
        channelMap.set(normalizedChannel, []);
      }
      channelMap.get(normalizedChannel)!.push({ track: item.track, score: item.score });
    }

    const sortedChannels = Array.from(channelMap.entries())
      .filter(([_, tracks]) => tracks.length >= 1)
      .sort((a, b) => {
        const scoreA = a[1].reduce((sum, t) => sum + t.score, 0);
        const scoreB = b[1].reduce((sum, t) => sum + t.score, 0);
        return scoreB - scoreA;
      })
      .slice(0, limit)
      .map(([channel, tracks]) => ({
        channel,
        tracks: tracks.slice(0, 5)
      }));

    return sortedChannels;
  }

  private normalizeChannelName(channel: string): string {
    return channel
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/\s*VEVO$/i, '')
      .replace(/\s*Official$/i, '')
      .trim();
  }

  async getArtists(limit: number = 50): Promise<{ name: string; trackCount: number; thumbnail?: string }[]> {
    const sharedTracks = await db.select().from(tracks)
      .where(and(
        eq(tracks.status, "ready"),
        or(eq(tracks.isShared, 1), isNull(tracks.userId))
      ));
    
    const artistMap: Map<string, { count: number; thumbnail?: string }> = new Map();
    
    for (const track of sharedTracks) {
      const normalizedName = this.normalizeChannelName(track.channel);
      const existing = artistMap.get(normalizedName);
      if (existing) {
        existing.count++;
        if (!existing.thumbnail && track.thumbnail) {
          existing.thumbnail = track.thumbnail;
        }
      } else {
        artistMap.set(normalizedName, { count: 1, thumbnail: track.thumbnail || undefined });
      }
    }
    
    const artists = Array.from(artistMap.entries())
      .map(([name, data]) => ({ name, trackCount: data.count, thumbnail: data.thumbnail }))
      .sort((a, b) => b.trackCount - a.trackCount)
      .slice(0, limit);
    
    return artists;
  }

  async getArtistTracks(artistName: string): Promise<Track[]> {
    const sharedTracks = await db.select().from(tracks)
      .where(and(
        eq(tracks.status, "ready"),
        or(eq(tracks.isShared, 1), isNull(tracks.userId))
      ))
      .orderBy(desc(tracks.addedAt));
    
    const normalizedSearch = this.normalizeChannelName(artistName).toLowerCase();
    
    return sharedTracks.filter(track => {
      const normalizedChannel = this.normalizeChannelName(track.channel).toLowerCase();
      return normalizedChannel === normalizedSearch;
    });
  }
}

export const storage = new DatabaseStorage();
