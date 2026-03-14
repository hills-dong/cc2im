import { readFileSync, writeFileSync } from "fs";
import { parse, stringify } from "yaml";
import type { AppConfig, ProjectConfig } from "./types.js";

export function loadConfig(path: string): AppConfig {
  const raw = readFileSync(path, "utf-8");
  const parsed = parse(raw) as AppConfig;

  if (process.env.DISCORD_TOKEN) {
    parsed.discord.token = process.env.DISCORD_TOKEN;
  }
  if (process.env.LARK_APP_ID) {
    parsed.lark.appId = process.env.LARK_APP_ID;
  }
  if (process.env.LARK_APP_SECRET) {
    parsed.lark.appSecret = process.env.LARK_APP_SECRET;
  }

  return parsed;
}

export function saveConfig(path: string, config: AppConfig): void {
  const toSave = structuredClone(config);
  if (process.env.DISCORD_TOKEN) toSave.discord.token = "";
  if (process.env.LARK_APP_ID) toSave.lark.appId = "";
  if (process.env.LARK_APP_SECRET) toSave.lark.appSecret = "";
  writeFileSync(path, stringify(toSave), "utf-8");
}

export function addProject(config: AppConfig, project: ProjectConfig): AppConfig {
  const existing = config.projects.findIndex(p => p.name === project.name);
  if (existing >= 0) {
    config.projects[existing] = project;
  } else {
    config.projects.push(project);
  }
  return config;
}

export function removeProject(config: AppConfig, name: string): AppConfig {
  config.projects = config.projects.filter(p => p.name !== name);
  return config;
}
