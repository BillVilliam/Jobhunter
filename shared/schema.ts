import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// CV versions - user uploads different versions of their CV
export const cvVersions = sqliteTable("cv_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // auto-generated or user-provided
  description: text("description"), // what this version emphasizes
  fileName: text("file_name").notNull(),
  fileContent: text("file_content").notNull(), // base64 encoded image file
  fileType: text("file_type").notNull(), // image (jpg/png/jpeg)
  targetRole: text("target_role"), // what role this CV targets (AI-detected)
  skills: text("skills"), // JSON array of key skills (AI-detected)
  language: text("language").default("en"), // cs, en, sk (AI-detected)
  imageContent: text("image_content"), // base64 encoded screenshot/photo of the CV
  parsedText: text("parsed_text"), // extracted plain text from image via Vision
  cvAnalysis: text("cv_analysis"), // full JSON AI analysis: { location, skills, languages, experience, education, suggestedCategories, ... }
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Cover letters / Motivačné listy
export const coverLetters = sqliteTable("cover_letters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // e.g. "AI Integrátor – motivačný list"
  content: text("content").notNull(), // the actual letter text
  tags: text("tags").notNull(), // JSON array of tags: ["ai","automation","junior-it", ...]
  language: text("language").default("cs"), // cs, en, sk
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Job listings found by the watcher
export const jobListings = sqliteTable("job_listings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  externalId: text("external_id"), // ID from the portal
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  description: text("description"),
  requirements: text("requirements"), // JSON array
  salary: text("salary"),
  portal: text("portal").notNull(), // jobs.cz, startupjobs.cz, etc.
  url: text("url").notNull(),
  matchScore: integer("match_score"), // 0-100 AI computed match
  matchReason: text("match_reason"), // AI explanation
  aiAnalysis: text("ai_analysis"), // full JSON from OpenAI: { score, reason, pros, cons, suggestedCV }
  status: text("status").notNull().default("new"), // new, applied, rejected, interview, ignored
  isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
  appliedAt: text("applied_at"),
  appliedWithCvId: integer("applied_with_cv_id"),
  discoveredAt: text("discovered_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Watcher configuration - what to look for
export const watcherConfigs = sqliteTable("watcher_configs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  portal: text("portal").notNull(), // jobs.cz, startupjobs.cz
  searchQuery: text("search_query").notNull(), // search keywords
  location: text("location").default("Praha"),
  country: text("country").default("auto"), // auto | cz | sk | both — which country's portals to scan
  locationLat: real("location_lat"),  // exact user lat for distance scoring
  locationLng: real("location_lng"),  // exact user lng for distance scoring
  minSalary: integer("min_salary"),
  maxSalary: integer("max_salary"),
  jobType: text("job_type"), // full-time, part-time, contract
  remoteOption: text("remote_option"), // onsite, hybrid, remote
  excludeKeywords: text("exclude_keywords"), // JSON array of keywords to skip
  requiredSkills: text("required_skills"), // JSON array of must-have skills
  // Job category filters – used by the AI engine to score relevance
  jobCategories: text("job_categories"), // JSON array: ["part-time","ai","automation","social-media","bank-tester","junior-it"]
  aiInstructions: text("ai_instructions"), // Custom instructions for GPT-4.1-mini – what to look for, preferences, etc.
  minMatchScore: integer("min_match_score").default(60), // only keep jobs with AI score >= this
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  autoApply: integer("auto_apply", { mode: "boolean" }).default(false),
  checkInterval: integer("check_interval").default(60), // minutes
  lastCheckedAt: text("last_checked_at"),
  createdAt: text("created_at").notNull(),
});

// App-wide settings (key/value) — e.g. credit system configuration
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Credit ledger — every AI usage (and top-up) is one row.
// Balance = sum of creditsDelta. Negative = spent, positive = granted.
export const creditLedger = sqliteTable("credit_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").default(1), // ready for multi-user accounts later
  action: text("action").notNull(), // job-analysis, cv-analysis, cover-letter, vision-ocr, starter-grant, topup
  tokensUsed: integer("tokens_used").default(0), // raw AI API tokens consumed
  creditsDelta: real("credits_delta").notNull(),
  details: text("details"),
  timestamp: text("timestamp").notNull(),
});

// Application history / log
export const applicationLogs = sqliteTable("application_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobListingId: integer("job_listing_id").notNull(),
  cvVersionId: integer("cv_version_id").notNull(),
  action: text("action").notNull(), // applied, cv_modified, matched, auto_applied
  details: text("details"), // JSON with details
  aiModifications: text("ai_modifications"), // what AI changed in the CV
  timestamp: text("timestamp").notNull(),
});

// User profile - for AI to personalize CVs
export const userProfile = sqliteTable("user_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  linkedIn: text("linked_in"),
  minSalaryFullTime: integer("min_salary_full_time"), // min plat plný úväzok
  minSalaryPartTime: integer("min_salary_part_time"), // min plat polovičný úväzok
  updatedAt: text("updated_at").notNull(),
});

// Insert schemas
export const insertCvVersionSchema = createInsertSchema(cvVersions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCoverLetterSchema = createInsertSchema(coverLetters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertJobListingSchema = createInsertSchema(jobListings).omit({
  id: true,
  discoveredAt: true,
  updatedAt: true,
});
export const insertWatcherConfigSchema = createInsertSchema(watcherConfigs).omit({
  id: true,
  createdAt: true,
  lastCheckedAt: true,
});
export const insertApplicationLogSchema = createInsertSchema(applicationLogs).omit({
  id: true,
  timestamp: true,
});
export const insertUserProfileSchema = createInsertSchema(userProfile).omit({
  id: true,
  updatedAt: true,
});

// Types
export type CvVersion = typeof cvVersions.$inferSelect;
export type InsertCvVersion = z.infer<typeof insertCvVersionSchema>;
export type CoverLetter = typeof coverLetters.$inferSelect;
export type InsertCoverLetter = z.infer<typeof insertCoverLetterSchema>;
export type JobListing = typeof jobListings.$inferSelect;
export type InsertJobListing = z.infer<typeof insertJobListingSchema>;
export type WatcherConfig = typeof watcherConfigs.$inferSelect;
export type InsertWatcherConfig = z.infer<typeof insertWatcherConfigSchema>;
export type ApplicationLog = typeof applicationLogs.$inferSelect;
export type InsertApplicationLog = z.infer<typeof insertApplicationLogSchema>;
export type UserProfile = typeof userProfile.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
