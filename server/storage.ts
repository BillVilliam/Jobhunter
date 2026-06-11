import {
  type CvVersion, type InsertCvVersion, cvVersions,
  type CoverLetter, type InsertCoverLetter, coverLetters,
  type JobListing, type InsertJobListing, jobListings,
  type WatcherConfig, type InsertWatcherConfig, watcherConfigs,
  type ApplicationLog, type InsertApplicationLog, applicationLogs,
  type UserProfile, type InsertUserProfile, userProfile,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, like, gte, ne, or, sql } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

// Lightweight in-place migration for existing databases (drizzle-kit push is
// manual; this keeps old data.db files working after the column was added)
try {
  const cols = sqlite.prepare(`PRAGMA table_info(watcher_configs)`).all() as { name: string }[];
  if (cols.length > 0 && !cols.some((c) => c.name === "country")) {
    sqlite.exec(`ALTER TABLE watcher_configs ADD COLUMN country TEXT DEFAULT 'auto'`);
    console.log("[storage] Migrated watcher_configs: added country column");
  }
} catch (err) {
  console.warn("[storage] country column migration skipped:", err);
}

export const db = drizzle(sqlite);

export interface IStorage {
  // CV Versions
  getCvVersions(): Promise<CvVersion[]>;
  getCvVersion(id: number): Promise<CvVersion | undefined>;
  createCvVersion(cv: InsertCvVersion): Promise<CvVersion>;
  updateCvVersion(id: number, cv: Partial<InsertCvVersion>): Promise<CvVersion | undefined>;
  deleteCvVersion(id: number): Promise<void>;

  // Cover Letters
  getCoverLetters(): Promise<CoverLetter[]>;
  getCoverLetter(id: number): Promise<CoverLetter | undefined>;
  createCoverLetter(cl: InsertCoverLetter): Promise<CoverLetter>;
  updateCoverLetter(id: number, cl: Partial<InsertCoverLetter>): Promise<CoverLetter | undefined>;
  deleteCoverLetter(id: number): Promise<void>;

  // Job Listings
  getJobListings(filters?: { status?: string; portal?: string; minScore?: number; limit?: number; favorite?: boolean }): Promise<JobListing[]>;
  getJobListing(id: number): Promise<JobListing | undefined>;
  createJobListing(job: InsertJobListing): Promise<JobListing>;
  updateJobListing(id: number, job: Partial<InsertJobListing>): Promise<JobListing | undefined>;
  clearUnprotectedJobs(): Promise<number>;
  getJobStats(): Promise<{ total: number; new: number; applied: number; interview: number; ignored: number }>;

  // Watcher Configs
  getWatcherConfigs(): Promise<WatcherConfig[]>;
  getWatcherConfig(id: number): Promise<WatcherConfig | undefined>;
  createWatcherConfig(config: InsertWatcherConfig): Promise<WatcherConfig>;
  updateWatcherConfig(id: number, config: Partial<InsertWatcherConfig>): Promise<WatcherConfig | undefined>;
  deleteWatcherConfig(id: number): Promise<void>;

  // Application Logs
  getApplicationLogs(jobId?: number): Promise<ApplicationLog[]>;
  createApplicationLog(log: InsertApplicationLog): Promise<ApplicationLog>;

  // User Profile
  getProfiles(): Promise<UserProfile[]>;
  getProfile(id: number): Promise<UserProfile | undefined>;
  createProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateProfile(id: number, profile: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;
  deleteProfile(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // CV Versions
  async getCvVersions(): Promise<CvVersion[]> {
    return db.select().from(cvVersions).orderBy(desc(cvVersions.updatedAt)).all();
  }

  async getCvVersion(id: number): Promise<CvVersion | undefined> {
    return db.select().from(cvVersions).where(eq(cvVersions.id, id)).get();
  }

  async createCvVersion(cv: InsertCvVersion): Promise<CvVersion> {
    const now = new Date().toISOString();
    return db.insert(cvVersions).values({ ...cv, createdAt: now, updatedAt: now }).returning().get();
  }

  async updateCvVersion(id: number, cv: Partial<InsertCvVersion>): Promise<CvVersion | undefined> {
    const now = new Date().toISOString();
    return db.update(cvVersions).set({ ...cv, updatedAt: now }).where(eq(cvVersions.id, id)).returning().get();
  }

  async deleteCvVersion(id: number): Promise<void> {
    db.delete(cvVersions).where(eq(cvVersions.id, id)).run();
  }

  // Cover Letters
  async getCoverLetters(): Promise<CoverLetter[]> {
    return db.select().from(coverLetters).orderBy(desc(coverLetters.updatedAt)).all();
  }

  async getCoverLetter(id: number): Promise<CoverLetter | undefined> {
    return db.select().from(coverLetters).where(eq(coverLetters.id, id)).get();
  }

  async createCoverLetter(cl: InsertCoverLetter): Promise<CoverLetter> {
    const now = new Date().toISOString();
    return db.insert(coverLetters).values({ ...cl, createdAt: now, updatedAt: now }).returning().get();
  }

  async updateCoverLetter(id: number, cl: Partial<InsertCoverLetter>): Promise<CoverLetter | undefined> {
    const now = new Date().toISOString();
    return db.update(coverLetters).set({ ...cl, updatedAt: now }).where(eq(coverLetters.id, id)).returning().get();
  }

  async deleteCoverLetter(id: number): Promise<void> {
    db.delete(coverLetters).where(eq(coverLetters.id, id)).run();
  }

  // Job Listings
  async getJobListings(filters?: { status?: string; portal?: string; minScore?: number; limit?: number; favorite?: boolean }): Promise<JobListing[]> {
    let query = db.select().from(jobListings);
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(jobListings.status, filters.status));
    } else {
      // by default hide disliked jobs
      conditions.push(ne(jobListings.status, "disliked"));
    }
    if (filters?.portal) conditions.push(eq(jobListings.portal, filters.portal));
    if (filters?.minScore != null) conditions.push(gte(jobListings.matchScore, filters.minScore));
  if (filters?.favorite != null) conditions.push(eq(jobListings.isFavorite, filters.favorite));
    let rows: JobListing[];
    const ordering = [desc(jobListings.isFavorite), desc(jobListings.matchScore)];
    if (conditions.length > 0) {
      rows = query.where(and(...conditions)).orderBy(...ordering).all();
    } else {
      rows = query.orderBy(...ordering).all();
    }
    if (filters?.limit != null && filters.limit > 0) {
      return rows.slice(0, filters.limit);
    }
    return rows;
  }

  async getJobListing(id: number): Promise<JobListing | undefined> {
    return db.select().from(jobListings).where(eq(jobListings.id, id)).get();
  }

  async createJobListing(job: InsertJobListing): Promise<JobListing> {
    const now = new Date().toISOString();
    return db.insert(jobListings).values({ ...job, discoveredAt: now, updatedAt: now }).returning().get();
  }

  async updateJobListing(id: number, job: Partial<InsertJobListing>): Promise<JobListing | undefined> {
    const now = new Date().toISOString();
    return db.update(jobListings).set({ ...job, updatedAt: now }).where(eq(jobListings.id, id)).returning().get();
  }

  async clearUnprotectedJobs(): Promise<number> {
    const result = db.delete(jobListings).where(
      and(
        ne(jobListings.status, "applied"),
        or(eq(jobListings.isFavorite, false), sql`${jobListings.isFavorite} IS NULL`)
      )
    ).run();
    return result.changes;
  }

  async getJobStats() {
    const all = db.select().from(jobListings).all();
    return {
      total: all.length,
      new: all.filter(j => j.status === "new").length,
      applied: all.filter(j => j.status === "applied").length,
      interview: all.filter(j => j.status === "interview").length,
      ignored: all.filter(j => j.status === "ignored").length,
    };
  }

  // Watcher Configs
  async getWatcherConfigs(): Promise<WatcherConfig[]> {
    return db.select().from(watcherConfigs).all();
  }

  async getWatcherConfig(id: number): Promise<WatcherConfig | undefined> {
    return db.select().from(watcherConfigs).where(eq(watcherConfigs.id, id)).get();
  }

  async createWatcherConfig(config: InsertWatcherConfig): Promise<WatcherConfig> {
    const now = new Date().toISOString();
    return db.insert(watcherConfigs).values({ ...config, createdAt: now }).returning().get();
  }

  async updateWatcherConfig(id: number, config: Partial<InsertWatcherConfig>): Promise<WatcherConfig | undefined> {
    return db.update(watcherConfigs).set(config).where(eq(watcherConfigs.id, id)).returning().get();
  }

  async deleteWatcherConfig(id: number): Promise<void> {
    db.delete(watcherConfigs).where(eq(watcherConfigs.id, id)).run();
  }

  // Application Logs
  async getApplicationLogs(jobId?: number): Promise<ApplicationLog[]> {
    if (jobId) {
      return db.select().from(applicationLogs).where(eq(applicationLogs.jobListingId, jobId)).orderBy(desc(applicationLogs.timestamp)).all();
    }
    return db.select().from(applicationLogs).orderBy(desc(applicationLogs.timestamp)).all();
  }

  async createApplicationLog(log: InsertApplicationLog): Promise<ApplicationLog> {
    const now = new Date().toISOString();
    return db.insert(applicationLogs).values({ ...log, timestamp: now }).returning().get();
  }

  // User Profile
  async getProfiles(): Promise<UserProfile[]> {
    return db.select().from(userProfile).all();
  }

  async getProfile(id: number): Promise<UserProfile | undefined> {
    return db.select().from(userProfile).where(eq(userProfile.id, id)).get();
  }

  async createProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const now = new Date().toISOString();
    return db.insert(userProfile).values({ ...profile, updatedAt: now }).returning().get();
  }

  async updateProfile(id: number, profile: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const now = new Date().toISOString();
    return db.update(userProfile).set({ ...profile, updatedAt: now }).where(eq(userProfile.id, id)).returning().get();
  }

  async deleteProfile(id: number): Promise<void> {
    db.delete(userProfile).where(eq(userProfile.id, id)).run();
  }
}

export const storage = new DatabaseStorage();
