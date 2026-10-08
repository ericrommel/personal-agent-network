import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_MODEL_INSTRUCTION,
  AVAILABILITY_TOOL,
} from "../../../../src/modules/external-ai/contracts.js";
import {
  XAI_RESPONSES_BASE_URL,
  XAI_RESPONSES_MODEL,
  createXaiResponsesProvider,
} from "../../../../src/modules/external-ai/xai-responses.js";

const KEY = "aaaaaaaa";

const options = (
  fetchImpl: typeof fetch,
  overrides: Partial<{ apiKey: string; model: string; baseUrl: string; timeoutMs: number }> = {},
) => ({
  apiKey: overrides.apiKey ?? KEY,
  model: overrides.model ?? XAI_RESPONSES_MODEL,
  baseUrl: overrides.baseUrl ?? XAI_RESPONSES_BASE_URL,
  fetchImpl,
  timeoutMs: overrides.timeoutMs ?? 1_000,
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("xAI responses provider", () => {
  it("rejects a provider that cannot keep the key on the authorization header", () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({});
    expect(createXaiResponsesProvider(options(fetchImpl, { apiKey: "short" }))).toBeNull();
    expect(createXaiResponsesProvider(options(fetchImpl, { apiKey: "bad key value" }))).toBeNull();
    expect(
      createXaiResponsesProvider(options(fetchImpl, { baseUrl: "http://api.x.ai/v1" })),
    ).toBeNull();
    expect(
      createXaiResponsesProvider(options(fetchImpl, { baseUrl: "https://user:pw@api.x.ai/v1" })),
    ).toBeNull();
    expect(createXaiResponsesProvider(options(fetchImpl, { timeoutMs: 0 }))).toBeNull();
    expect(createXaiResponsesProvider(options(fetchImpl, { model: "" }))).toBeNull();
    expect(createXaiResponsesProvider(options(fetchImpl, { baseUrl: "not a url" }))).toBeNull();
    expect(
      createXaiResponsesProvider(options(fetchImpl, { baseUrl: "https://api.x.ai/v2" })),
    ).toBeNull();
    expect(createXaiResponsesProvider(options(fetchImpl, { timeoutMs: 30_001 }))).toBeNull();
    expect(createXaiResponsesProvider(options(fetchImpl, { timeoutMs: 1.5 }))).toBeNull();
    expect(createXaiResponsesProvider(options(fetchImpl, { apiKey: "k".repeat(513) }))).toBeNull();
    expect(
      createXaiResponsesProvider(options(fetchImpl, { apiKey: 12 as unknown as string })),
    ).toBeNull();
    expect(createXaiResponsesProvider(options(fetchImpl, { model: "m".repeat(65) }))).toBeNull();
    expect(
      createXaiResponsesProvider(options(fetchImpl, { baseUrl: "https://api.x.ai/v1?x=1" })),
    ).toBeNull();
    expect(
      createXaiResponsesProvider(options(fetchImpl, { baseUrl: "https://api.x.ai/v1#x" })),
    ).toBeNull();
  });

  it("sends one availability tool and parses only the function call", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      seen.push({ url: String(url), init: init ?? {} });
      return jsonResponse({
        id: "resp_1",
        output: [
          { type: "reasoning", encrypted_content: "do not forward" },
          {
            type: "function_call",
            name: "pan_availability_check",
            call_id: "call_1",
            arguments: JSON.stringify({
              who: "Maria",
              start: "2026-10-08T12:01:00.000Z",
              end: "2026-10-08T13:01:00.000Z",
            }),
          },
        ],
      });
    };
    const provider = createXaiResponsesProvider(
      options(fetchImpl, { baseUrl: `${XAI_RESPONSES_BASE_URL}/` }),
    );
    if (provider === null) {
      throw new Error("provider");
    }
    const first = await provider.complete({
      userText: "Is Maria available Saturday at 20:00?",
      tool: AVAILABILITY_TOOL,
      prior: null,
    });
    const body = String(seen[0]?.init.body);
    const headers = new Headers(seen[0]?.init.headers);
    expect(seen[0]?.url).toBe("https://api.x.ai/v1/responses");
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(body).toContain(AVAILABILITY_MODEL_INSTRUCTION);
    expect(body).toContain("pan_availability_check");
    expect(body).not.toContain(KEY);
    expect(body).not.toContain("pan_agent_");
    expect(body).not.toContain("encrypted_content");
    expect(first?.turn.calls).toEqual([
      {
        id: "call_1",
        name: "pan_availability_check",
        arguments: {
          who: "Maria",
          start: "2026-10-08T12:01:00.000Z",
          end: "2026-10-08T13:01:00.000Z",
        },
      },
    ]);

    const secondFetch: typeof fetch = async (_url, init) => {
      seen.push({ url: "second", init: init ?? {} });
      return jsonResponse({
        id: "resp_2",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Maria is not available then." }],
          },
        ],
      });
    };
    const talking = createXaiResponsesProvider(options(secondFetch));
    if (talking === null) {
      throw new Error("provider");
    }
    const second = await talking.complete({
      tool: null,
      prior: { responseId: "resp_1", callId: "call_1", output: '{"result":false}' },
    });
    const follow = JSON.parse(String(seen[1]?.init.body)) as {
      input: Array<{ output: string }>;
      tool_choice: string;
      tools?: unknown;
    };
    expect(follow.input[0]?.output).toBe('{"result":false}');
    expect(follow.tool_choice).toBe("none");
    expect(follow.tools).toBeUndefined();
    expect(follow).not.toContain(KEY);
    expect(second?.turn.text).toBe("Maria is not available then.");
    expect(second?.turn.calls).toEqual([]);
  });

  it("does not send private text or call the network for a bad tool result", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return jsonResponse({});
    };
    const provider = createXaiResponsesProvider(options(fetchImpl));
    if (provider === null) {
      throw new Error("provider");
    }
    expect(
      await provider.complete({
        tool: null,
        prior: { responseId: "resp_1", callId: "call_1", output: '{"busy":"12:30"}' },
      }),
    ).toBeNull();
    expect(calls).toBe(0);
    expect(
      await provider.complete({
        userText: `the key is ${KEY}`,
        tool: AVAILABILITY_TOOL,
        prior: null,
      }),
    ).toBeNull();
    expect(calls).toBe(0);
    expect(
      await provider.complete({
        tool: null,
        prior: { responseId: "bad id", callId: "call_1", output: '{"result":true}' },
      }),
    ).toBeNull();
    expect(
      await provider.complete({
        tool: null,
        prior: { responseId: "resp_1", callId: "bad id", output: '{"outcome":"unavailable"}' },
      }),
    ).toBeNull();
    expect(calls).toBe(0);
  });

  it("fails closed on an unusable model response", async () => {
    const bodies = [
      { status: 500, body: { id: "resp_1", output: [] } },
      { status: 200, body: "not-json" },
      { status: 200, body: 4 },
      { status: 200, body: { id: "resp_1" } },
      { status: 200, body: { id: "bad id", output: [] } },
      { status: 200, body: { id: "resp_1", output: [{ type: "web_search" }] } },
      { status: 200, body: { id: "resp_1", output: [null] } },
      { status: 200, body: { id: "resp_1", output: [[]] } },
      {
        status: 200,
        body: { id: "resp_1", output: [{ type: "message", content: [{ type: "image" }] }] },
      },
      {
        status: 200,
        body: {
          id: "resp_1",
          output: [{ type: "function_call", name: "", call_id: "call_1", arguments: "{}" }],
        },
      },
      {
        status: 200,
        body: {
          id: "resp_1",
          output: [{ type: "function_call", name: "tool", call_id: "bad id", arguments: "{}" }],
        },
      },
      {
        status: 200,
        body: {
          id: "resp_1",
          output: [{ type: "message", content: [{ type: "output_text", text: 4 }] }],
        },
      },
      {
        status: 200,
        body: {
          id: "resp_1",
          output: [
            {
              type: "function_call",
              name: "pan_availability_check",
              call_id: "call_1",
              arguments: "{",
            },
          ],
        },
      },
      { status: 200, body: { id: "resp_1", output: [{ type: "message", content: "text" }] } },
      {
        status: 200,
        body: {
          id: "resp_1",
          output: [
            { type: "message", content: [{ type: "output_text", text: "x".repeat(4_001) }] },
          ],
        },
      },
      {
        status: 200,
        body: {
          id: "resp_1",
          output: Array.from({ length: 5 }, () => ({
            type: "function_call",
            name: "pan_availability_check",
            call_id: "call_1",
            arguments: "{}",
          })),
        },
      },
      {
        status: 200,
        body: {
          id: "resp_1",
          output: [{ type: "function_call", name: "tool", call_id: "call_1", arguments: 4 }],
        },
      },
      {
        status: 200,
        body: {
          id: "resp_1",
          output: [
            {
              type: "function_call",
              name: "tool",
              call_id: "call_1",
              arguments: "x".repeat(2_001),
            },
          ],
        },
      },
    ];
    for (const item of bodies) {
      const provider = createXaiResponsesProvider(
        options(async () => jsonResponse(item.body, item.status)),
      );
      if (provider === null) {
        throw new Error("provider");
      }
      expect(
        await provider.complete({
          userText: "Is Maria available?",
          tool: AVAILABILITY_TOOL,
          prior: null,
        }),
      ).toBeNull();
    }

    const huge = createXaiResponsesProvider(
      options(async () => jsonResponse({ id: "resp_1", output: [], pad: "x".repeat(70_000) })),
    );
    expect(
      await huge?.complete({
        userText: "Is Maria available?",
        tool: AVAILABILITY_TOOL,
        prior: null,
      }),
    ).toBeNull();

    const aborted = createXaiResponsesProvider(
      options(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
        { timeoutMs: 20 },
      ),
    );
    expect(
      await aborted?.complete({
        userText: "Is Maria available?",
        tool: AVAILABILITY_TOOL,
        prior: null,
      }),
    ).toBeNull();
  });
});
