#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import fs from "fs";
import path from "path";
import {
  GitLabMergeRequestSchema,
  GitLabSearchResponseSchema,
  SearchRepositoriesSchema,
  GitLabMergeRequestDiffSchema,
  GetMergeRequestSchema,
  GetMergeRequestDiffsSchema,
  CodeReviewReportSchema,
  GetCommitDiffSchema,
  ListRepositoryCommitsSchema,
  GitLabCommitSchema,
  type GitLabRepository,
  type GitLabMergeRequest,
  type GitLabSearchResponse,
  type GitLabMergeRequestDiff,
  type GitLabCommit,
} from "./schemas.js";

/**
 * Read version from package.json
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = path.resolve(__dirname, '../package.json');
let SERVER_VERSION = "unknown";
try {
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    SERVER_VERSION = packageJson.version || SERVER_VERSION;
  }
} catch (error) {
  console.error("Warning: Could not read version from package.json:", error);
}

const server = new Server(
  {
    name: "vb-gitlab-mcp-server",
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const GITLAB_PERSONAL_ACCESS_TOKEN = process.env.GITLAB_PERSONAL_ACCESS_TOKEN;

/**
 * Smart URL handling for GitLab API
 *
 * @param {string | undefined} url - Input GitLab API URL
 * @returns {string} Normalized GitLab API URL with /api/v4 path
 */
function normalizeGitLabApiUrl(url?: string): string {
  if (!url) {
    return "https://gitlab.com/api/v4";
  }

  // Remove trailing slash if present
  let normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  // Check if URL already has /api/v4
  if (!normalizedUrl.endsWith('/api/v4') && !normalizedUrl.endsWith('/api/v4/')) {
    // Append /api/v4 if not already present
    normalizedUrl = `${normalizedUrl}/api/v4`;
  }

  return normalizedUrl;
}

// Use the normalizeGitLabApiUrl function to handle various URL formats
const GITLAB_API_URL = normalizeGitLabApiUrl(process.env.GITLAB_API_URL || "");

// Add debug logging for API URL construction
console.log("=== MCP Server Configuration ===");
console.log(`GITLAB_API_URL = "${GITLAB_API_URL}"`);
console.log(`Example project API URL = "${GITLAB_API_URL}/projects/123"`);
console.log(`Example Notes API URL = "${GITLAB_API_URL}/projects/123/issues/1/notes"`);
console.log("===============================");

if (!GITLAB_PERSONAL_ACCESS_TOKEN) {
  console.error("GITLAB_PERSONAL_ACCESS_TOKEN environment variable is not set");
  process.exit(1);
}

/**
 * Common headers for GitLab API requests
 */
const DEFAULT_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
};

/**
 * Utility function for handling GitLab API errors
 *
 * @param {import("node-fetch").Response} response - The response from GitLab API
 * @throws {Error} Throws an error with response details if the request failed
 */
async function handleGitLabError(
  response: import("node-fetch").Response
): Promise<void> {
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `GitLab API error: ${response.status} ${response.statusText}\n${errorBody}`
    );
  }
}


/**
 * Search for GitLab projects
 *
 * @param {string} query - The search query
 * @param {number} [page=1] - The page number
 * @param {number} [perPage=20] - Number of items per page
 * @returns {Promise<GitLabSearchResponse>} The search results
 */
async function searchProjects(
  query: string,
  page: number = 1,
  perPage: number = 20
): Promise<GitLabSearchResponse> {
  const url = new URL(`${GITLAB_API_URL}/projects`);
  url.searchParams.append("search", query);
  url.searchParams.append("page", page.toString());
  url.searchParams.append("per_page", perPage.toString());
  url.searchParams.append("order_by", "id");
  url.searchParams.append("sort", "desc");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${GITLAB_PERSONAL_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `GitLab API error: ${response.status} ${response.statusText}\n${errorBody}`
    );
  }

  const projects = (await response.json()) as GitLabRepository[];
  const totalCount = response.headers.get("x-total");
  const totalPages = response.headers.get("x-total-pages");

  // GitLab API doesn't return these headers for results > 10,000
  const count = totalCount ? parseInt(totalCount) : projects.length;

  return GitLabSearchResponseSchema.parse({
    count,
    total_pages: totalPages ? parseInt(totalPages) : Math.ceil(count / perPage),
    current_page: page,
    items: projects,
  });
}



/**
 * Get merge request details
 *
 * @param {string} projectId - The ID or URL-encoded path of the project
 * @param {number} mergeRequestIid - The internal ID of the merge request
 * @returns {Promise<GitLabMergeRequest>} The merge request details
 */
async function getMergeRequest(
  projectId: string,
  mergeRequestIid: number
): Promise<GitLabMergeRequest> {
  const url = new URL(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(
      projectId
    )}/merge_requests/${mergeRequestIid}`
  );

  const response = await fetch(url.toString(), {
    headers: DEFAULT_HEADERS,
  });

  await handleGitLabError(response);
  return GitLabMergeRequestSchema.parse(await response.json());
}

/**
 * Get merge request changes/diffs
 *
 * @param {string} projectId - The ID or URL-encoded path of the project
 * @param {number} mergeRequestIid - The internal ID of the merge request
 * @param {string} [view] - The view type for the diff (inline or parallel)
 * @returns {Promise<GitLabMergeRequestDiff[]>} The merge request diffs
 */
async function getMergeRequestDiffs(
  projectId: string,
  mergeRequestIid: number,
  view?: "inline" | "parallel"
): Promise<GitLabMergeRequestDiff[]> {
  const url = new URL(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(
      projectId
    )}/merge_requests/${mergeRequestIid}/changes`
  );

  if (view) {
    url.searchParams.append("view", view);
  }

  const response = await fetch(url.toString(), {
    headers: DEFAULT_HEADERS,
  });

  await handleGitLabError(response);
  const data = (await response.json()) as { changes: unknown };
  return z.array(GitLabMergeRequestDiffSchema).parse(data.changes);
}

/**
 * Get commit diffs
 *
 * @param {string} projectId - The ID or URL-encoded path of the project
 * @param {string} commitSha - The commit SHA hash
 * @returns {Promise<GitLabMergeRequestDiff[]>} The commit diffs
 */
async function getCommitDiff(
  projectId: string,
  commitSha: string
): Promise<GitLabMergeRequestDiff[]> {
  const url = new URL(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(
      projectId
    )}/repository/commits/${commitSha}/diff`
  );

  const response = await fetch(url.toString(), {
    headers: DEFAULT_HEADERS,
  });

  await handleGitLabError(response);
  return z.array(GitLabMergeRequestDiffSchema).parse(await response.json());
}

/**
 * Save code review report as HTML file
 * 
 * @param {string} projectId - The ID or URL-encoded path of the project
 * @param {number} mergeRequestIid - The internal ID of the merge request
 * @param {string} reportContent - The HTML content of the report
 * @param {string} outputFile - The path where to save the HTML file
 * @returns {Promise<string>} The path where the file was saved
 */
async function saveCodeReviewReport(
  projectId: string,
  mergeRequestIid: number,
  reportContent: string,
  outputFile: string
): Promise<string> {
  // Ensure the directory exists
  const dir = path.dirname(outputFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write the HTML file
  fs.writeFileSync(outputFile, reportContent, 'utf8');
  
  return outputFile;
}

/**
 * Get a list of repository commits in a project
 *
 * @param {string} projectId - The ID or URL-encoded path of the project
 * @param {Object} options - Optional parameters
 * @param {string} [options.refName] - The name of a repository branch, tag or revision range
 * @param {string} [options.since] - Only commits after or on this date (ISO 8601 format)
 * @param {string} [options.until] - Only commits before or on this date (ISO 8601 format)
 * @param {string} [options.author] - Search commits by author
 * @param {boolean} [options.all] - Retrieve every commit from the repository
 * @returns {Promise<GitLabCommit[]>} List of commits
 */
async function listRepositoryCommits(
  projectId: string,
  options: {
    refName?: string;
    since?: string;
    until?: string;
    author?: string;
    all?: boolean;
  } = {}
): Promise<GitLabCommit[]> {
  const url = new URL(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/repository/commits`
  );

  // Add optional parameters
  if (options.refName) {
    url.searchParams.append("ref_name", options.refName);
  }
  if (options.since) {
    url.searchParams.append("since", options.since);
  }
  if (options.until) {
    url.searchParams.append("until", options.until);
  }
  if (options.author) {
    url.searchParams.append("author", options.author);
  }
  if (options.all !== undefined) {
    url.searchParams.append("all", options.all.toString());
  }

  const response = await fetch(url.toString(), {
    headers: DEFAULT_HEADERS,
  });

  await handleGitLabError(response);
  return z.array(GitLabCommitSchema).parse(await response.json());
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_repositories",
        description: "Search for GitLab projects",
        inputSchema: zodToJsonSchema(SearchRepositoriesSchema),
      },
      {
        name: "get_merge_request",
        description: "Get details of a merge request",
        inputSchema: zodToJsonSchema(GetMergeRequestSchema),
      },
      {
        name: "get_merge_request_diffs",
        description: "Get the changes/diffs of a merge request",
        inputSchema: zodToJsonSchema(GetMergeRequestDiffsSchema),
      },
      {
        name: "list_repository_commits",
        description: "Get a list of repository commits in a project",
        inputSchema: zodToJsonSchema(ListRepositoryCommitsSchema),
      },
      {
        name: "get_commit_diff",
        description: "Get the diff of a commit",
        inputSchema: zodToJsonSchema(GetCommitDiffSchema),
      },
      {
        name: "report_code_review_results",
        description: "Save code review results as an HTML file locally",
        inputSchema: zodToJsonSchema(CodeReviewReportSchema),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }
    switch (request.params.name) {
      case "search_repositories": {
        const args = SearchRepositoriesSchema.parse(request.params.arguments);
        const results = await searchProjects(
          args.search,
          args.page,
          args.per_page
        );
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      }

      case "get_merge_request": {
        const args = GetMergeRequestSchema.parse(request.params.arguments);
        const mergeRequest = await getMergeRequest(
          args.project_id,
          args.merge_request_iid
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(mergeRequest, null, 2) },
          ],
        };
      }

      case "get_merge_request_diffs": {
        const args = GetMergeRequestDiffsSchema.parse(request.params.arguments);
        const diffs = await getMergeRequestDiffs(
          args.project_id,
          args.merge_request_iid,
          args.view
        );
        return {
          content: [{ type: "text", text: JSON.stringify(diffs, null, 2) }],
        };
      }

      case "get_commit_diff": {
        const args = GetCommitDiffSchema.parse(request.params.arguments);
        const diffs = await getCommitDiff(
          args.project_id,
          args.commit_sha
        );
        return {
          content: [{ type: "text", text: JSON.stringify(diffs, null, 2) }],
        };
      }

      case "list_repository_commits": {
        const args = ListRepositoryCommitsSchema.parse(request.params.arguments);
        const commits = await listRepositoryCommits(
          args.project_id,
          {
            refName: args.ref_name,
            since: args.since,
            until: args.until,
            author: args.author,
            all: args.all
          }
        );
        return {
          content: [{ type: "text", text: JSON.stringify(commits, null, 2) }],
        };
      }

      case "report_code_review_results": {
        const args = CodeReviewReportSchema.parse(request.params.arguments);
        const savedPath = await saveCodeReviewReport(
          args.project_id,
          args.merge_request_iid,
          args.report_content,
          args.output_file
        );
        return {
          content: [
            { type: "text", text: `Code review report saved to: ${savedPath}` },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ")}`
      );
    }
    throw error;
  }
});

/**
 * Initialize and run the server
 */
async function runServer() {
  try {
    console.error("========================");
    console.error(`GitLab MCP Server v${SERVER_VERSION}`);
    console.error(`API URL: ${GITLAB_API_URL}`);
    console.error("========================");

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("GitLab MCP Server running on stdio");
  } catch (error) {
    console.error("Error initializing server:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
