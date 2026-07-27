import { describe, expect, test } from "bun:test";
import {
  armRedirectChatFollowUp,
  chatFollowupNudge,
  minutesFromNow,
  parseRedirectFollowUpPayload,
} from "@/modules/channel-redirect/followup";
import { CHANNEL_REDIRECT_DEFAULTS } from "@/modules/channel-redirect/service";
import type { enqueueJob } from "@/modules/scheduler/service";

describe("parseRedirectFollowUpPayload", () => {
  test("valid chat-stage payload", () => {
    expect(
      parseRedirectFollowUpPayload({
        stage: "chat",
        widgetThreadId: "1:2:3",
        agentId: "9",
        entryInboxId: 7,
      }),
    ).toEqual({
      stage: "chat",
      widgetThreadId: "1:2:3",
      agentId: "9",
      entryInboxId: 7,
    });
  });

  test("valid whatsapp-stage payload with a null entryInboxId", () => {
    expect(
      parseRedirectFollowUpPayload({
        stage: "whatsapp",
        widgetThreadId: "1:2:3",
        agentId: "9",
      }),
    ).toEqual({
      stage: "whatsapp",
      widgetThreadId: "1:2:3",
      agentId: "9",
      entryInboxId: null,
    });
  });

  test("valid closing-stage payload", () => {
    expect(
      parseRedirectFollowUpPayload({
        stage: "closing",
        widgetThreadId: "1:2:3",
        agentId: "9",
        entryInboxId: 7,
      }),
    ).toEqual({
      stage: "closing",
      widgetThreadId: "1:2:3",
      agentId: "9",
      entryInboxId: 7,
    });
  });

  test("rejects a missing/invalid stage", () => {
    expect(
      parseRedirectFollowUpPayload({
        stage: "bogus",
        widgetThreadId: "1:2:3",
        agentId: "9",
      }),
    ).toBeNull();
    expect(
      parseRedirectFollowUpPayload({ widgetThreadId: "1:2:3", agentId: "9" }),
    ).toBeNull();
  });

  test("rejects a missing widgetThreadId or agentId", () => {
    expect(
      parseRedirectFollowUpPayload({ stage: "chat", agentId: "9" }),
    ).toBeNull();
    expect(
      parseRedirectFollowUpPayload({
        stage: "chat",
        widgetThreadId: "1:2:3",
      }),
    ).toBeNull();
    expect(
      parseRedirectFollowUpPayload({
        stage: "chat",
        widgetThreadId: "1:2:3",
        agentId: 9, // wrong type (must be a string)
      }),
    ).toBeNull();
  });
});

describe("nudge builders", () => {
  test("chatFollowupNudge carries the redirect source + kind + instructions", () => {
    const n = chatFollowupNudge("Pergunte se ainda precisa de ajuda.");
    expect(n.source).toBe("channel-redirect");
    expect(n.kind).toBe("chat-followup");
    expect(n.instructions).toBe("Pergunte se ainda precisa de ajuda.");
  });
});

describe("minutesFromNow", () => {
  test("adds N minutes to the given instant", () => {
    const now = new Date("2026-07-05T12:00:00Z");
    expect(minutesFromNow(60, now).toISOString()).toBe(
      "2026-07-05T13:00:00.000Z",
    );
    expect(minutesFromNow(0, now).toISOString()).toBe(now.toISOString());
  });
});

describe("armRedirectChatFollowUp", () => {
  function fakeEnqueue() {
    const calls: Array<Parameters<typeof enqueueJob>[0]> = [];
    const fn = (async (p: Parameters<typeof enqueueJob>[0]) => {
      calls.push(p);
      return 1n;
    }) as typeof enqueueJob;
    return { fn, calls };
  }

  const cfg = {
    ...CHANNEL_REDIRECT_DEFAULTS,
    chatFollowupEnabled: true,
    chatFollowupDelayValue: 30,
  };
  const now = new Date("2026-07-05T12:00:00Z");

  test("enqueues a REDIRECT_FOLLOWUP stage=chat job, dedupeKey by widgetThreadId, runAt = now + delay", async () => {
    const { fn, calls } = fakeEnqueue();
    const armed = await armRedirectChatFollowUp(
      {
        tenantId: 1n,
        instanceId: 2n,
        widgetThreadId: "1:2:30",
        agentId: 9n,
        entryInboxId: 7,
        cfg,
        now,
      },
      fn,
    );
    expect(armed).toBe(true);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.kind).toBe("REDIRECT_FOLLOWUP");
    expect(call?.dedupeKey).toBe("redirect-followup:1:2:30");
    expect(call?.runAt.toISOString()).toBe("2026-07-05T12:30:00.000Z");
    expect(call?.payload).toEqual({
      stage: "chat",
      widgetThreadId: "1:2:30",
      agentId: "9",
      entryInboxId: 7,
    });
  });

  test("no-ops only when EVERY follow-up step is disabled", async () => {
    const { fn, calls } = fakeEnqueue();
    const armed = await armRedirectChatFollowUp(
      {
        tenantId: 1n,
        instanceId: 2n,
        widgetThreadId: "1:2:30",
        agentId: 9n,
        entryInboxId: 7,
        cfg: {
          ...cfg,
          chatFollowupEnabled: false,
          waFollowupEnabled: false,
          closingEnabled: false,
        },
        now,
      },
      fn,
    );
    expect(armed).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("still arms (at stage chat) when the chat step is off but a later stage is on", async () => {
    const { fn, calls } = fakeEnqueue();
    const armed = await armRedirectChatFollowUp(
      {
        tenantId: 1n,
        instanceId: 2n,
        widgetThreadId: "1:2:30",
        agentId: 9n,
        entryInboxId: 7,
        cfg: {
          ...cfg,
          chatFollowupEnabled: false,
          waFollowupEnabled: true,
          closingEnabled: false,
        },
        now,
      },
      fn,
    );
    expect(armed).toBe(true);
    expect(calls[0]?.payload).toMatchObject({ stage: "chat" });
  });

  test("no-ops (defense in depth) when the thread's tenant/instance doesn't match — never enqueues across a tenant fence", async () => {
    const { fn, calls } = fakeEnqueue();
    const wrongTenant = await armRedirectChatFollowUp(
      {
        tenantId: 999n,
        instanceId: 2n,
        widgetThreadId: "1:2:30", // tenant 1, not 999
        agentId: 9n,
        entryInboxId: 7,
        cfg,
        now,
      },
      fn,
    );
    const wrongInstance = await armRedirectChatFollowUp(
      {
        tenantId: 1n,
        instanceId: 999n, // thread says instance 2
        widgetThreadId: "1:2:30",
        agentId: 9n,
        entryInboxId: 7,
        cfg,
        now,
      },
      fn,
    );
    expect(wrongTenant).toBe(false);
    expect(wrongInstance).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
