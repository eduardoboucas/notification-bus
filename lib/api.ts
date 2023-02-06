export enum ItemType {
  Critical = 1,
  Warning = 2,
  Info = 3,
}

export interface APIResponse {
  items: Item[];
}

export interface Item {
  body: string;
  title?: string;
  severity: ItemType;
  display_interval: number;
  inputs?: string[];
  min_app_version?: string;
  max_app_version?: string;
  min_node_version?: string;
  max_node_version?: string;
  arch?: string[];
  platform?: string[];
}
