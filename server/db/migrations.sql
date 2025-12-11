-- Performance optimization: Add strategic indexes for frequently queried columns
-- Run this migration to optimize database performance

-- Index on tracks table
CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_video_id ON tracks(video_id);
CREATE INDEX IF NOT EXISTS idx_tracks_status ON tracks(status);
CREATE INDEX IF NOT EXISTS idx_tracks_is_shared ON tracks(is_shared);
CREATE INDEX IF NOT EXISTS idx_tracks_channel ON tracks(channel);
CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON tracks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_user_status ON tracks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tracks_video_user ON tracks(video_id, user_id);

-- Index on posts table
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_track_id ON posts(track_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- Index on reactions table
CREATE INDEX IF NOT EXISTS idx_reactions_post_id ON reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_post_user ON reactions(post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_type ON reactions(type);

-- Index on comments table
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

-- Index on follows table
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower_following ON follows(follower_id, following_id);

-- Index on shares table
CREATE INDEX IF NOT EXISTS idx_shares_post_id ON shares(post_id);
CREATE INDEX IF NOT EXISTS idx_shares_user_id ON shares(user_id);
CREATE INDEX IF NOT EXISTS idx_shares_post_user ON shares(post_id, user_id);

-- Index on playlists table
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlists_is_public ON playlists(is_public);

-- Index on playlist_tracks table
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position ON playlist_tracks(position);

-- Index on notifications table
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

-- Index on profiles table
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON profiles(display_name);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tracks_shared_status ON tracks(is_shared, status) WHERE is_shared = 1;
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE is_read = 0;

-- Full-text search indexes (PostgreSQL specific)
CREATE INDEX IF NOT EXISTS idx_tracks_title_fulltext ON tracks USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_tracks_channel_fulltext ON tracks USING gin(to_tsvector('english', channel));
CREATE INDEX IF NOT EXISTS idx_profiles_username_fulltext ON profiles USING gin(to_tsvector('english', username));
CREATE INDEX IF NOT EXISTS idx_profiles_displayname_fulltext ON profiles USING gin(to_tsvector('english', display_name));

-- Optimize existing data
VACUUM ANALYZE tracks;
VACUUM ANALYZE posts;
VACUUM ANALYZE reactions;
VACUUM ANALYZE comments;
VACUUM ANALYZE follows;
VACUUM ANALYZE notifications;
VACUUM ANALYZE profiles;
VACUUM ANALYZE playlists;
VACUUM ANALYZE playlist_tracks;
VACUUM ANALYZE shares;
