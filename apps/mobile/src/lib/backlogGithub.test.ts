import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BacklogHttpError, BacklogOffline, githubProvider, nextPage, parseRepo, withStatus } from "./backlogGithub.ts";

const TOKEN = "github_pat_TEST_ONLY";
const API = "https://api.github.com/repos/me/life";

type Call = { url: string; method: string; body: unknown; auth: string | null };

/** Fake fetch: answers from a route table and records every request. */
function fakeGitHub(routes: Record<string, (body: unknown) => { status?: number; json?: unknown; link?: string }>) {
  const calls: Call[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), method, body, auth: new Headers(init?.headers).get("authorization") });
    const route = routes[`${method} ${String(url)}`];
    if (!route) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    const r = route(body);
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), {
      status: r.status ?? 200,
      headers: r.link ? { link: r.link } : {},
    });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const issue = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  title: `Issue ${number}`,
  body: null,
  state: "open",
  labels: [],
  html_url: `https://github.com/me/life/issues/${number}`,
  updated_at: "2026-10-28T10:00:00Z",
  ...extra,
});

const provider = (fetch: typeof globalThis.fetch) => githubProvider({ owner: "me", repo: "life", token: TOKEN, fetch });

describe("githubProvider.list", () => {
  it("maps state and labels to status, kind and module, skips pull requests and follows pages", async () => {
    const page1 = `${API}/issues?state=all&per_page=100&sort=updated&direction=desc`;
    const page2 = `${API}/issues?state=all&per_page=100&sort=updated&direction=desc&page=2`;
    const gh = fakeGitHub({
      [`GET ${page1}`]: () => ({
        json: [
          issue(3, { labels: [{ name: "status:doing" }, { name: "module:hair-care" }, { name: "bug" }] }),
          issue(2, { pull_request: {} }),
        ],
        link: `<${page2}>; rel="next", <${page2}>; rel="last"`,
      }),
      [`GET ${page2}`]: () => ({ json: [issue(1, { state: "closed", labels: ["enhancement"], body: "Texte" })] }),
    });
    const items = await provider(gh.fetch).list();
    assert.deepEqual(
      items.map((i) => [i.id, i.status, i.kind, i.module]),
      [
        ["3", "doing", "bug", "hair-care"],
        ["1", "done", "idea", null],
      ],
    );
    assert.equal(items[1].description, "Texte");
    assert.ok(gh.calls.every((c) => c.auth === `Bearer ${TOKEN}`));
  });

  it("never follows a next link off api.github.com", () => {
    assert.equal(nextPage('<https://evil.example/steal>; rel="next"'), null);
    assert.equal(nextPage(null), null);
  });
});

describe("githubProvider writes", () => {
  it("creates an issue with kind and module labels", async () => {
    const gh = fakeGitHub({
      [`POST ${API}/issues`]: (body) => ({ status: 201, json: issue(7, { title: (body as { title: string }).title, labels: (body as { labels: string[] }).labels }) }),
    });
    const item = await provider(gh.fetch).create({ title: "  Bouton trop petit ", description: "Détails", kind: "bug", module: "courses" });
    assert.deepEqual(gh.calls[0].body, { title: "Bouton trop petit", body: "Détails", labels: ["bug", "module:courses"] });
    assert.equal(item.id, "7");
    assert.equal(item.module, "courses");
  });

  it("moves to doing: reopens and adds the status label, keeping the others", async () => {
    const gh = fakeGitHub({
      [`GET ${API}/issues/4`]: () => ({ json: issue(4, { labels: ["module:sport", "claude-code"] }) }),
      [`PATCH ${API}/issues/4`]: (body) => ({ json: issue(4, { labels: (body as { labels: string[] }).labels }) }),
    });
    const item = await provider(gh.fetch).setStatus("4", "doing");
    assert.deepEqual(gh.calls[1].body, { state: "open", labels: ["module:sport", "claude-code", "status:doing"] });
    assert.equal(item.status, "doing");
  });

  it("moves to done: closes as completed and drops the status label", async () => {
    const gh = fakeGitHub({
      [`GET ${API}/issues/4`]: () => ({ json: issue(4, { labels: ["status:doing", "bug"] }) }),
      [`PATCH ${API}/issues/4`]: (body) => ({ json: issue(4, { state: "closed", labels: (body as { labels: string[] }).labels }) }),
    });
    const item = await provider(gh.fetch).setStatus("4", "done");
    assert.deepEqual(gh.calls[1].body, { state: "closed", state_reason: "completed", labels: ["bug"] });
    assert.equal(item.status, "done");
  });

  it("comments on an issue", async () => {
    const gh = fakeGitHub({ [`POST ${API}/issues/4/comments`]: () => ({ status: 201, json: { id: 1 } }) });
    await provider(gh.fetch).comment("4", "Fait dans la v1.1");
    assert.deepEqual(gh.calls[0].body, { body: "Fait dans la v1.1" });
  });

  it("rejects ids that are not issue numbers before calling GitHub", async () => {
    const gh = fakeGitHub({});
    await assert.rejects(provider(gh.fetch).comment("../../user", "x"), BacklogHttpError);
    assert.equal(gh.calls.length, 0);
  });
});

describe("errors", () => {
  it("explains a refused token without echoing it", async () => {
    const gh = fakeGitHub({ [`POST ${API}/issues`]: () => ({ status: 401, json: { message: "Bad credentials" } }) });
    await assert.rejects(provider(gh.fetch).create({ title: "x", description: "", kind: "idea", module: null }), (e: unknown) => {
      assert.ok(e instanceof BacklogHttpError && e.status === 401);
      assert.ok(!(e as Error).message.includes(TOKEN));
      return true;
    });
  });

  it("reports a network failure as offline", async () => {
    const failing = (async () => {
      throw new TypeError("Network request failed");
    }) as typeof globalThis.fetch;
    await assert.rejects(provider(failing).list(), BacklogOffline);
  });
});

describe("helpers", () => {
  it("parses a repository from a slug or a URL", () => {
    assert.deepEqual(parseRepo("me/life-dashboard"), { owner: "me", repo: "life-dashboard" });
    assert.deepEqual(parseRepo("https://github.com/me/life-dashboard.git"), { owner: "me", repo: "life-dashboard" });
    assert.deepEqual(parseRepo("git@github.com:me/life-dashboard.git"), { owner: "me", repo: "life-dashboard" });
    assert.equal(parseRepo("life-dashboard"), null);
  });

  it("adds the doing label once and removes it for other statuses", () => {
    assert.deepEqual(withStatus(["bug", "status:doing"], "doing"), ["bug", "status:doing"]);
    assert.deepEqual(withStatus(["bug", "status:doing"], "todo"), ["bug"]);
  });
});
