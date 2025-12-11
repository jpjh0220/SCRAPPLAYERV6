import { beforeAll, afterAll, afterEach } from "vitest";

// Mock environment variables for testing
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgresql://test:test@localhost:5432/scrapplayer_test";

beforeAll(async () => {
  // Setup test database, mock services, etc.
  console.log("Test setup complete");
});

afterEach(() => {
  // Clean up after each test
});

afterAll(async () => {
  // Cleanup after all tests
  console.log("Test cleanup complete");
});
