import nock from "nock";
import tmp from "tmp-promise";
import { assert, describe, expect, test, vi } from "vitest";

import { APIResponse, Item } from "../lib/api.js";
import { NotificationBus } from "./main.js";

describe("`getItems()`", async () => {
  test("Returns a list of all items", async () => {
    const mockCache = await tmp.tmpName({ postfix: ".json" });
    const mockResponse: APIResponse = {
      items: [
        {
          body: "This is a test",
          severity: 3,
          display_interval: 30_000,
        },
      ],
    };
    const scope = nock("https://my-cli.netlify.app")
      .get("/v1/api/1.2.3")
      .reply(200, mockResponse);
    const bus = new NotificationBus({
      cachePath: mockCache,
      name: "hello",
      url: "https://my-cli.netlify.app/v1/api",
      version: "1.2.3",
    });

    const items1 = await bus.getItems({ markAsRendered: true });

    expect(items1[0].last_rendered).toBe(0);
    expect(items1[0].body).toBe("This is a test");

    const items2 = await bus.getItems({ markAsRendered: true });

    assert.approximately(items2[0].last_rendered as number, Date.now(), 100);
    expect(items2[0].body).toBe("This is a test");

    expect(scope.isDone()).toBe(true);
  });
});

describe("`render()`", async () => {
  test("Calls the callback with the list of items", async () => {
    const mockCache = await tmp.tmpName({ postfix: ".json" });
    const mockResponse: APIResponse = {
      items: [
        {
          body: "This is a test",
          severity: 3,
          display_interval: 30_000,
        },
      ],
    };
    const renderer = (items: Item[]) => {
      assert.equal(items.length, 1);
      assert.equal(items[0].body, "This is a test");
    };
    const mockRenderer = vi.fn().mockImplementation(renderer);
    const scope = nock("https://my-cli.netlify.app")
      .get("/v1/api/1.2.3")
      .reply(200, mockResponse);
    const bus = new NotificationBus({
      cachePath: mockCache,
      name: "hello",
      renderer: mockRenderer,
      url: "https://my-cli.netlify.app/v1/api",
      version: "1.2.3",
    });

    await bus.render();

    expect(mockRenderer).toHaveBeenCalledTimes(1);
    expect(scope.isDone()).toBe(true);
  });
});
