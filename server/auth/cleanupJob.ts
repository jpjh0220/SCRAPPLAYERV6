import { LocalAuthService } from "./localAuth";

/**
 * Daily cleanup job to delete inactive accounts
 * Accounts that haven't logged in for 7+ days are automatically deleted
 */
export class AccountCleanupJob {
  private authService: LocalAuthService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(authService: LocalAuthService) {
    this.authService = authService;
  }

  /**
   * Run cleanup immediately
   */
  runNow(): number {
    if (this.isRunning) {
      console.log("[CleanupJob] Already running, skipping...");
      return 0;
    }

    this.isRunning = true;
    console.log("[CleanupJob] Starting account cleanup...");

    try {
      const deletedCount = this.authService.cleanupInactiveAccounts();
      const timestamp = new Date().toISOString();

      console.log(`[CleanupJob] Completed at ${timestamp}: ${deletedCount} accounts deleted`);

      return deletedCount;
    } catch (error) {
      console.error("[CleanupJob] Error during cleanup:", error);
      return 0;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start scheduled cleanup job
   * Runs once per day at the specified hour (default: 3 AM)
   */
  start(hourOfDay: number = 3) {
    if (this.intervalId) {
      console.log("[CleanupJob] Already started");
      return;
    }

    console.log(`[CleanupJob] Scheduling daily cleanup at ${hourOfDay}:00`);

    // Run immediately on start
    this.runNow();

    // Calculate milliseconds until next run
    const scheduleNextRun = () => {
      const now = new Date();
      const next = new Date();
      next.setHours(hourOfDay, 0, 0, 0);

      // If we've passed the hour today, schedule for tomorrow
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      const msUntilNext = next.getTime() - now.getTime();

      console.log(`[CleanupJob] Next run scheduled for ${next.toISOString()}`);

      this.intervalId = setTimeout(() => {
        this.runNow();
        scheduleNextRun(); // Schedule next run after completing
      }, msUntilNext);
    };

    scheduleNextRun();
  }

  /**
   * Stop the scheduled cleanup job
   */
  stop() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      console.log("[CleanupJob] Stopped");
    }
  }

  /**
   * Check if cleanup job is running
   */
  isActive(): boolean {
    return this.intervalId !== null;
  }
}
