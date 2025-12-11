import { describe, it, expect } from "vitest";
import { extractVideoId, extractArtist } from "../../utils/youtube";

describe("YouTube Utils", () => {
  describe("extractVideoId", () => {
    it("should extract video ID from standard YouTube URL", () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      expect(extractVideoId(url)).toBe("dQw4w9WgXcQ");
    });

    it("should extract video ID from youtu.be short URL", () => {
      const url = "https://youtu.be/dQw4w9WgXcQ";
      expect(extractVideoId(url)).toBe("dQw4w9WgXcQ");
    });

    it("should extract video ID from URL with timestamp", () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s";
      expect(extractVideoId(url)).toBe("dQw4w9WgXcQ");
    });

    it("should return null for invalid URL", () => {
      const url = "https://example.com/invalid";
      expect(extractVideoId(url)).toBeNull();
    });
  });

  describe("extractArtist", () => {
    it("should extract artist from metadata", () => {
      const info = {
        artist: "Taylor Swift",
        title: "Shake It Off",
        channel: "TaylorSwiftVEVO",
      };
      expect(extractArtist(info)).toBe("Taylor Swift");
    });

    it("should extract artist from title with hyphen separator", () => {
      const info = {
        title: "Drake - God's Plan",
        channel: "DrakeVEVO",
      };
      expect(extractArtist(info)).toBe("Drake");
    });

    it("should extract artist from ft. pattern", () => {
      const info = {
        title: "Post Malone ft. Swae Lee - Sunflower",
        channel: "PostMaloneVEVO",
      };
      // When title has " - " it takes precedence over ft. pattern
      expect(extractArtist(info)).toBe("Post Malone ft. Swae Lee");
    });

    it("should use channel name when no other info available", () => {
      const info = {
        title: "Great Song",
        channel: "MusicChannel",
      };
      expect(extractArtist(info)).toBe("MusicChannel");
    });

    it("should filter out non-artist channels", () => {
      const info = {
        title: "Artist Name - Song Title",
        channel: "Lyrical Lemonade",
      };
      expect(extractArtist(info)).toBe("Artist Name");
    });

    it("should remove ' - Topic' suffix from auto-generated channels", () => {
      const info = {
        title: "Song Title",
        channel: "Artist Name - Topic",
      };
      expect(extractArtist(info)).toBe("Artist Name");
    });

    it("should return 'YouTube' as fallback for empty info", () => {
      const info = {};
      // When no info is available, it defaults to "YouTube"
      expect(extractArtist(info)).toBe("YouTube");
    });
  });
});
