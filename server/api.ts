import { promises as fs } from "fs";
import { resolve } from "path";

import { builder, Handler } from "@netlify/functions";
import semver from "semver";

import { Item } from "../lib/api.js";

let data = fs
  .readFile(resolve("data", "events.json"), "utf8")
  .then((data) => JSON.parse(data) as Item[]);

const api: Handler = async (event) => {
  const urlParts = event.path.split("/");
  const version = urlParts[2];

  if (!semver.valid(version)) {
    return {
      statusCode: 400,
      body: `'${version}' is not a valid semver version`,
    };
  }

  const items = await data;
  const filteredItems = items.filter((item) => {
    if (item.min_app_version && semver.lt(version, item.min_app_version)) {
      return false;
    }

    if (item.max_app_version && semver.gt(version, item.max_app_version)) {
      return false;
    }

    return true;
  });
  const responseData = {
    items: filteredItems,
  };

  return {
    statusCode: 200,
    body: JSON.stringify(responseData),
    headers: {
      "content-type": "application/json",
    },
  };
};

export const handler = builder(api);
