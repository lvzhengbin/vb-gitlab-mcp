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
  UpdateMergeRequestSchema,
  type GitLabRepository,
  type GitLabMergeRequest,
  type GitLabSearchResponse,
  type GitLabMergeRequestDiff,
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
 * Update a merge request
 *
 * @param {string} projectId - The ID or URL-encoded path of the project
 * @param {number} mergeRequestIid - The internal ID of the merge request
 * @param {Object} options - The update options
 * @returns {Promise<GitLabMergeRequest>} The updated merge request
 */
async function updateMergeRequest(
  projectId: string,
  mergeRequestIid: number,
  options: Omit<
    z.infer<typeof UpdateMergeRequestSchema>,
    "project_id" | "merge_request_iid"
  >
): Promise<GitLabMergeRequest> {
  const url = new URL(
    `${GITLAB_API_URL}/projects/${encodeURIComponent(
      projectId
    )}/merge_requests/${mergeRequestIid}`
  );

  const response = await fetch(url.toString(), {
    method: "PUT",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(options),
  });

  await handleGitLabError(response);
  return GitLabMergeRequestSchema.parse(await response.json());
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
        name: "update_merge_request",
        description: "Update a merge request",
        inputSchema: zodToJsonSchema(UpdateMergeRequestSchema),
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

      case "update_merge_request": {
        const args = UpdateMergeRequestSchema.parse(request.params.arguments);
        const { project_id, merge_request_iid, ...options } = args;
        const mergeRequest = await updateMergeRequest(
          project_id,
          merge_request_iid,
          options
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(mergeRequest, null, 2) },
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
