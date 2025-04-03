import { z } from "zod";

// Base schemas for common types
export const GitLabAuthorSchema = z.object({
  name: z.string(),
  email: z.string(),
  date: z.string(),
});

// Namespace related schemas
export const GitLabNamespaceSchema = z.object({
  id: z.number(),
  name: z.string(),
  path: z.string(),
  kind: z.enum(["user", "group"]),
  full_path: z.string(),
  parent_id: z.number().nullable(),
  avatar_url: z.string().nullable(),
  web_url: z.string(),
  members_count_with_descendants: z.number().optional(),
  billable_members_count: z.number().optional(),
  max_seats_used: z.number().optional(),
  seats_in_use: z.number().optional(),
  plan: z.string().optional(),
  end_date: z.string().nullable().optional(),
  trial_ends_on: z.string().nullable().optional(),
  trial: z.boolean().optional(),
  root_repository_size: z.number().optional(),
  projects_count: z.number().optional(),
});

export const GitLabNamespaceExistsResponseSchema = z.object({
  exists: z.boolean(),
  suggests: z.array(z.string()).optional(),
});

// Repository related schemas
export const GitLabOwnerSchema = z.object({
  username: z.string(), // Changed from login to match GitLab API
  id: z.number(),
  avatar_url: z.string(),
  web_url: z.string(), // Changed from html_url to match GitLab API
  name: z.string(), // Added as GitLab includes full name
  state: z.string(), // Added as GitLab includes user state
});

export const GitLabRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  path_with_namespace: z.string(),
  visibility: z.string().optional(),
  owner: GitLabOwnerSchema.optional(),
  web_url: z.string().optional(),
  description: z.string().nullable(),
  fork: z.boolean().optional(),
  ssh_url_to_repo: z.string().optional(),
  http_url_to_repo: z.string().optional(),
  created_at: z.string().optional(),
  last_activity_at: z.string().optional(),
  default_branch: z.string().optional(),
  namespace: z.object({
    id: z.number(),
    name: z.string(),
    path: z.string(),
    kind: z.string(),
    full_path: z.string(),
    avatar_url: z.string().nullable().optional(),
    web_url: z.string().optional(),
  }).optional(),
  readme_url: z.string().optional().nullable(),
  topics: z.array(z.string()).optional(),
  tag_list: z.array(z.string()).optional(), // deprecated but still present
  open_issues_count: z.number().optional(),
  archived: z.boolean().optional(),
  forks_count: z.number().optional(),
  star_count: z.number().optional(),
  permissions: z.object({
    project_access: z.object({
      access_level: z.number(),
      notification_level: z.number().optional(),
    }).optional().nullable(),
    group_access: z.object({
      access_level: z.number(),
      notification_level: z.number().optional(),
    }).optional().nullable(),
  }).optional(),
  container_registry_enabled: z.boolean().optional(),
  container_registry_access_level: z.string().optional(),
  issues_enabled: z.boolean().optional(),
  merge_requests_enabled: z.boolean().optional(),
  wiki_enabled: z.boolean().optional(),
  jobs_enabled: z.boolean().optional(),
  snippets_enabled: z.boolean().optional(),
  can_create_merge_request_in: z.boolean().optional(),
  resolve_outdated_diff_discussions: z.boolean().optional(),
  shared_runners_enabled: z.boolean().optional(),
  shared_with_groups: z.array(z.object({
    group_id: z.number(),
    group_name: z.string(),
    group_full_path: z.string(),
    group_access_level: z.number(),
  })).optional(),
});

// Project schema (extended from repository schema)
export const GitLabProjectSchema = GitLabRepositorySchema;

// File content schemas
export const GitLabFileContentSchema = z.object({
  file_name: z.string(), // Changed from name to match GitLab API
  file_path: z.string(), // Changed from path to match GitLab API
  size: z.number(),
  encoding: z.string(),
  content: z.string(),
  content_sha256: z.string(), // Changed from sha to match GitLab API
  ref: z.string(), // Added as GitLab requires branch reference
  blob_id: z.string(), // Added to match GitLab API
  commit_id: z.string(), // ID of the current file version
  last_commit_id: z.string(), // Added to match GitLab API
  execute_filemode: z.boolean().optional(), // Added to match GitLab API
});

export const GitLabDirectoryContentSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.string(),
  mode: z.string(),
  id: z.string(), // Changed from sha to match GitLab API
  web_url: z.string(), // Changed from html_url to match GitLab API
});

export const GitLabContentSchema = z.union([
  GitLabFileContentSchema,
  z.array(GitLabDirectoryContentSchema),
]);

// Tree and commit schemas
export const GitLabTreeEntrySchema = z.object({
  id: z.string(), // Changed from sha to match GitLab API
  name: z.string(),
  type: z.enum(["blob", "tree"]),
  path: z.string(),
  mode: z.string(),
});

export const GitLabTreeSchema = z.object({
  id: z.string(), // Changed from sha to match GitLab API
  tree: z.array(GitLabTreeEntrySchema),
});

// Reference schema
export const GitLabReferenceSchema = z.object({
  name: z.string(), // Changed from ref to match GitLab API
  commit: z.object({
    id: z.string(), // Changed from sha to match GitLab API
    web_url: z.string(), // Changed from url to match GitLab API
  }),
});

export const GitLabSearchResponseSchema = z.object({
  count: z.number().optional(),
  total_pages: z.number().optional(),
  current_page: z.number().optional(),
  items: z.array(GitLabRepositorySchema),
});

export const GitLabUserSchema = z.object({
  username: z.string(), // Changed from login to match GitLab API
  id: z.number(),
  name: z.string(),
  avatar_url: z.string(),
  web_url: z.string(), // Changed from html_url to match GitLab API
});

// Merge Request related schemas (equivalent to Pull Request)
export const GitLabMergeRequestDiffRefSchema = z.object({
  base_sha: z.string(),
  head_sha: z.string(),
  start_sha: z.string(),
});

export const GitLabMergeRequestSchema = z.object({
  id: z.number(),
  iid: z.number(),
  project_id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  state: z.string(),
  merged: z.boolean().optional(),
  draft: z.boolean().optional(),
  author: GitLabUserSchema,
  assignees: z.array(GitLabUserSchema).optional(),
  source_branch: z.string(),
  target_branch: z.string(),
  diff_refs: GitLabMergeRequestDiffRefSchema.nullable().optional(),
  web_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  merged_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  merge_commit_sha: z.string().nullable(),
  detailed_merge_status: z.string().optional(),
  merge_status: z.string().optional(),
  merge_error: z.string().nullable().optional(),
  work_in_progress: z.boolean().optional(),
  blocking_discussions_resolved: z.boolean().optional(),
  should_remove_source_branch: z.boolean().nullable().optional(),
  force_remove_source_branch: z.boolean().nullable().optional(),
  allow_collaboration: z.boolean().optional(),
  allow_maintainer_to_push: z.boolean().optional(),
  changes_count: z.string().nullable().optional(),
  merge_when_pipeline_succeeds: z.boolean().optional(),
  squash: z.boolean().optional(),
  labels: z.array(z.string()).optional(),
});

// API Operation Parameter Schemas
const ProjectParamsSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"), // Changed from owner/repo to match GitLab API
});

export const SearchRepositoriesSchema = z.object({
  search: z.string().describe("Search query"), // Changed from query to match GitLab API
  page: z
    .number()
    .optional()
    .describe("Page number for pagination (default: 1)"),
  per_page: z
    .number()
    .optional()
    .describe("Number of results per page (default: 20)"),
});

export const GetFileContentsSchema = ProjectParamsSchema.extend({
  file_path: z.string().describe("Path to the file or directory"),
  ref: z.string().optional().describe("Branch/tag/commit to get contents from"),
});

export const GitLabMergeRequestDiffSchema = z.object({
  old_path: z.string(),
  new_path: z.string(),
  a_mode: z.string(),
  b_mode: z.string(),
  diff: z.string(),
  new_file: z.boolean(),
  renamed_file: z.boolean(),
  deleted_file: z.boolean(),
});

export const GetMergeRequestSchema = ProjectParamsSchema.extend({
  merge_request_iid: z
    .number()
    .describe("The internal ID of the merge request"),
});

export const GetMergeRequestDiffsSchema = GetMergeRequestSchema.extend({
  view: z.enum(["inline", "parallel"]).optional().describe("Diff view type"),
});

// Namespace API operation schemas
export const ListNamespacesSchema = z.object({
  search: z.string().optional().describe("Search term for namespaces"),
  page: z.number().optional().describe("Page number for pagination"),
  per_page: z.number().optional().describe("Number of items per page"),
  owned: z.boolean().optional().describe("Filter for namespaces owned by current user"),
});

export const GetNamespaceSchema = z.object({
  namespace_id: z.string().describe("Namespace ID or full path"),
});

export const VerifyNamespaceSchema = z.object({
  path: z.string().describe("Namespace path to verify"),
});

// Project API operation schemas
export const GetProjectSchema = z.object({
  project_id: z.string().describe("Project ID or URL-encoded path"),
});

// Export types
export type GitLabAuthor = z.infer<typeof GitLabAuthorSchema>;

export type GitLabFileContent = z.infer<typeof GitLabFileContentSchema>;
export type GitLabDirectoryContent = z.infer<typeof GitLabDirectoryContentSchema>;
export type GitLabContent = z.infer<typeof GitLabContentSchema>;
export type GitLabTree = z.infer<typeof GitLabTreeSchema>;
export type GitLabReference = z.infer<typeof GitLabReferenceSchema>;
export type GitLabNamespace = z.infer<typeof GitLabNamespaceSchema>;
export type GitLabNamespaceExistsResponse = z.infer<typeof GitLabNamespaceExistsResponseSchema>;
export type GitLabProject = z.infer<typeof GitLabProjectSchema>;

export type GitLabRepository = z.infer<typeof GitLabRepositorySchema>;
export type GitLabMergeRequest = z.infer<typeof GitLabMergeRequestSchema>;
export type GitLabSearchResponse = z.infer<typeof GitLabSearchResponseSchema>;
export type GitLabMergeRequestDiff = z.infer<typeof GitLabMergeRequestDiffSchema>;