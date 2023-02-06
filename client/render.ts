import boxen from "boxen";
import wrap from "word-wrap";

import { ItemType } from "../lib/api.js";
import type { LocalItem } from "./main.js";

const getColor = (type: ItemType) => {
  switch (type) {
    case ItemType.Critical:
      return "red";

    case ItemType.Warning:
      return "yellow";

    default:
      return undefined;
  }
};

const renderItem = (item: LocalItem) => {
  const options = {
    borderColor: getColor(item.severity),
    padding: 1,
    title: item.title,
  };
  const wrappedText = wrap(item.body, { width: 60 });

  return boxen(wrappedText, options);
};

export const render = (items: LocalItem[]) => {
  const text = items.map(renderItem).join("\n\n");

  console.log(text);
};
