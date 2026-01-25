import { fetchWithRetry } from "./net";

export type GovernanceSource = "snapshot" | "tally" | "unknown";

export type ProposalDetails = {
  source: GovernanceSource;
  proposal_id: string;
  title: string;
  body: string;
  choices: string[];
  start: number;
  end: number;
  author: string;
  space: string;
};

export type VotesSummary = {
  source: GovernanceSource;
  proposal_id: string;
  total_votes: number | null;
  scores_total: number | null;
  scores: number[] | null;
  choices: string[] | null;
};

type GraphqlError = { message?: string };
type GraphqlResponse<T> = { data?: T; errors?: GraphqlError[] };

type SnapshotProposal = {
  id?: string;
  title?: string;
  body?: string;
  choices?: string[];
  start?: number;
  end?: number;
  author?: string;
  space?: { id?: string } | null;
  scores?: number[];
  scores_total?: number;
  votes?: number;
};

type TallyOrganization = { slug?: string; name?: string };
type TallyGovernor = { id: string; slug?: string; organization?: TallyOrganization | null };
type TallyVoteStat = { type?: string; votesCount?: number; votersCount?: number };
type TallyTimestamp = { timestamp?: number } | null;
type TallyProposal = {
  id?: string;
  onchainId?: string;
  metadata?: { title?: string; description?: string } | null;
  proposer?: { address?: string } | null;
  start?: TallyTimestamp;
  end?: TallyTimestamp;
  voteStats?: TallyVoteStat[] | null;
  governor?: TallyGovernor | null;
};

export function detectSource(url: string): GovernanceSource {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("snapshot.org")) return "snapshot";
    if (host.includes("tally.xyz")) return "tally";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function parseSnapshotUrl(url: string): { proposalId: string } | null {
  const parsed = new URL(url);
  const hash = parsed.hash.replace(/^#/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[1] !== "proposal") {
    return { proposalId: parts[1] };
  }
  if (parts.length >= 3 && parts[1] === "proposal") {
    return { proposalId: parts[2] };
  }
  return null;
}

function parseTallyUrl(
  url: string
): { slug: string; onchainId: string; governorId: string | null } | null {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const govIdx = parts.indexOf("gov");
  if (govIdx !== -1 && parts[govIdx + 1] && parts[govIdx + 2] === "proposal") {
    const slug = parts[govIdx + 1];
    const onchainId = parts[govIdx + 3];
    const governorId = parsed.searchParams.get("govId");
    if (onchainId) return { slug, onchainId, governorId };
  }
  return null;
}

async function snapshotGraphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetchWithRetry(
    "https://hub.snapshot.org/graphql",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
    { retries: 2, retryOnStatuses: [429, 500], backoffMs: 500, maxBackoffMs: 4000 }
  );
  const data = (await res.json()) as GraphqlResponse<T>;
  if (!res.ok || data.errors?.length) {
    const message = data.errors?.[0]?.message || `Snapshot API error ${res.status}`;
    throw new Error(message);
  }
  return data.data as T;
}

async function tallyGraphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.TALLY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TALLY_API_KEY in env");
  }
  const res = await fetchWithRetry(
    "https://api.tally.xyz/query",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Api-Key": apiKey },
      body: JSON.stringify({ query, variables }),
    },
    { retries: 2, retryOnStatuses: [429, 500], backoffMs: 500, maxBackoffMs: 4000 }
  );
  const data = (await res.json()) as GraphqlResponse<T>;
  if (!res.ok || data.errors?.length) {
    const message = data.errors?.[0]?.message || `Tally API error ${res.status}`;
    throw new Error(message);
  }
  return data.data as T;
}

function tallyTimestamp(node: { timestamp?: number; ts?: number } | null | undefined): number {
  const ts = node?.timestamp ?? node?.ts;
  const n = Number(ts || 0);
  return Number.isFinite(n) ? n : 0;
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchTallyGovernor(slug: string): Promise<TallyGovernor> {
  const query = `
    query Governor($input: GovernorInput!) {
      governor(input: $input) {
        id
        slug
        organization { slug name }
      }
    }
  `;
  const data = await tallyGraphql<{ governor?: TallyGovernor }>(query, {
    input: { slug },
  });
  if (!data?.governor) {
    throw new Error("Tally governor not found");
  }
  return data.governor;
}

async function fetchTallyProposalByOnchain(
  governorId: string,
  onchainId: string
): Promise<TallyProposal> {
  const query = `
    query Proposal($input: ProposalInput!) {
      proposal(input: $input) {
        id
        onchainId
        metadata { title description }
        proposer { address }
        start { ... on Block { timestamp } ... on BlocklessTimestamp { timestamp } }
        end { ... on Block { timestamp } ... on BlocklessTimestamp { timestamp } }
        voteStats { type votesCount votersCount }
        governor { id slug organization { slug name } }
      }
    }
  `;
  const data = await tallyGraphql<{ proposal?: TallyProposal }>(query, {
    input: { onchainId, governorId },
  });
  if (!data?.proposal) {
    throw new Error("Tally proposal not found");
  }
  return data.proposal;
}

async function fetchTallyProposalById(proposalId: string): Promise<TallyProposal> {
  const query = `
    query Proposal($input: ProposalInput!) {
      proposal(input: $input) {
        id
        voteStats { type votesCount votersCount }
      }
    }
  `;
  const data = await tallyGraphql<{ proposal?: TallyProposal }>(query, {
    input: { id: proposalId },
  });
  if (!data?.proposal) {
    throw new Error("Tally proposal not found");
  }
  return data.proposal;
}

async function fetchSnapshotProposal(proposalId: string): Promise<ProposalDetails> {
  const query = `
    query Proposal($id: String!) {
      proposal(id: $id) {
        id
        title
        body
        choices
        start
        end
        author
        space { id }
      }
    }
  `;
  const data = await snapshotGraphql<{ proposal?: SnapshotProposal }>(query, {
    id: proposalId,
  });
  const proposal = data?.proposal;
  if (!proposal) {
    throw new Error("Snapshot proposal not found");
  }
  return {
    source: "snapshot",
    proposal_id: proposal.id || "",
    title: proposal.title || "",
    body: proposal.body || "",
    choices: Array.isArray(proposal.choices) ? proposal.choices : [],
    start: Number(proposal.start || 0),
    end: Number(proposal.end || 0),
    author: proposal.author || "",
    space: proposal.space?.id || "",
  };
}

async function fetchTallyProposal(
  slug: string,
  onchainId: string,
  governorId: string | null
): Promise<ProposalDetails> {
  const governor = governorId ? { id: governorId, slug } : await fetchTallyGovernor(slug);
  const proposal = await fetchTallyProposalByOnchain(governor.id, onchainId);
  const voteStats = Array.isArray(proposal.voteStats) ? proposal.voteStats : [];
  const choices = voteStats.length
    ? voteStats.map((stat) => String(stat?.type ?? "")).filter((v) => v)
    : ["for", "against", "abstain"];
  const space = proposal.governor?.organization?.slug || proposal.governor?.slug || slug;
  return {
    source: "tally",
    proposal_id: String(proposal.id ?? onchainId),
    title: proposal.metadata?.title || "",
    body: proposal.metadata?.description || "",
    choices,
    start: tallyTimestamp(proposal.start),
    end: tallyTimestamp(proposal.end),
    author: proposal.proposer?.address || "",
    space,
  };
}

async function fetchSnapshotVotesSummary(proposalId: string): Promise<VotesSummary | null> {
  const query = `
    query ProposalVotes($id: String!) {
      proposal(id: $id) {
        id
        choices
        scores
        scores_total
        votes
      }
    }
  `;
  const data = await snapshotGraphql<{ proposal?: SnapshotProposal }>(query, {
    id: proposalId,
  });
  const proposal = data?.proposal;
  if (!proposal) return null;
  return {
    source: "snapshot",
    proposal_id: proposal.id || "",
    total_votes: Number.isFinite(proposal.votes) ? Number(proposal.votes) : null,
    scores_total: Number.isFinite(proposal.scores_total)
      ? Number(proposal.scores_total)
      : null,
    scores: Array.isArray(proposal.scores) ? proposal.scores : null,
    choices: Array.isArray(proposal.choices) ? proposal.choices : null,
  };
}

async function fetchTallyVotesSummary(proposalId: string): Promise<VotesSummary | null> {
  const proposal = await fetchTallyProposalById(proposalId);
  const stats = Array.isArray(proposal.voteStats) ? proposal.voteStats : [];
  if (!stats.length) return null;
  const choices = stats.map((stat) => String(stat?.type ?? "")).filter((v) => v);
  const scoreValues = stats.map((stat) => toNumber(stat?.votesCount));
  const voterValues = stats.map((stat) => toNumber(stat?.votersCount));
  const scores =
    scoreValues.length && scoreValues.every((v) => v !== null)
      ? (scoreValues as number[])
      : null;
  const scores_total =
    scoreValues.length && scoreValues.some((v) => v !== null)
      ? scoreValues.reduce((sum, v) => sum + (v || 0), 0)
      : null;
  const total_votes =
    voterValues.length && voterValues.some((v) => v !== null)
      ? voterValues.reduce((sum, v) => sum + (v || 0), 0)
      : null;
  return {
    source: "tally",
    proposal_id: String(proposal.id),
    total_votes,
    scores_total,
    scores,
    choices: choices.length ? choices : null,
  };
}

export async function fetchProposalFromUrl(url: string): Promise<ProposalDetails> {
  const source = detectSource(url);
  if (source === "snapshot") {
    const parsed = parseSnapshotUrl(url);
    if (!parsed) {
      throw new Error("Invalid Snapshot proposal URL");
    }
    return await fetchSnapshotProposal(parsed.proposalId);
  }
  if (source === "tally") {
    const parsed = parseTallyUrl(url);
    if (!parsed) {
      throw new Error("Invalid Tally proposal URL");
    }
    return await fetchTallyProposal(parsed.slug, parsed.onchainId, parsed.governorId);
  }
  throw new Error("Unsupported proposal source");
}

export async function fetchVotesSummary(
  source: GovernanceSource,
  proposal_id: string
): Promise<VotesSummary | null> {
  if (source === "snapshot") {
    return await fetchSnapshotVotesSummary(proposal_id);
  }
  if (source === "tally") {
    return await fetchTallyVotesSummary(proposal_id);
  }
  return null;
}
