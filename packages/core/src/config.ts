import { readFileSync, writeFileSync } from "fs";
import { parse, stringify } from "yaml";
import type { AppConfig, ProjectConfig } from "./types.js";

export function loadConfig(path: string): AppConfig {
  const raw = readFileSync(path, "utf-8");
  const parsed = parse(raw) as AppConfig;

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid config: file is empty or contains no valid YAML`);
  }

  if (process.env.DISCORD_TOKEN) {
    if (!parsed.discord) parsed.discord = { token: "" };
    parsed.discord.token = process.env.DISCORD_TOKEN;
  }
  if (process.env.LARK_APP_ID) {
    if (!parsed.lark) parsed.lark = { appId: "", appSecret: "" };
    parsed.lark.appId = process.env.LARK_APP_ID;
  }
  if (process.env.LARK_APP_SECRET) {
    if (!parsed.lark) parsed.lark = { appId: "", appSecret: "" };
    parsed.lark.appSecret = process.env.LARK_APP_SECRET;
  }

  // Validate and fix common config structure issues
  for (const project of parsed.projects) {
    if (Array.isArray(project.platforms)) {
      // Convert ["discord"] → { discord: true }
      const arr = project.platforms as unknown as string[];
      project.platforms = {};
      for (const p of arr) {
        (project.platforms as any)[p] = true;
      }
      console.warn(`[config] Fixed platforms format for project "${project.name}" (array → object)`);
    }
  }

  if (parsed.formatter && !parsed.formatter.maxMessageLength) {
    // Support flat keys: maxMessageLengthDiscord → maxMessageLength.discord
    const f = parsed.formatter as any;
    parsed.formatter.maxMessageLength = {
      discord: f.maxMessageLengthDiscord ?? 2000,
      lark: f.maxMessageLengthLark ?? 30000,
      web: f.maxMessageLengthWeb ?? 100000,
    };
    console.warn("[config] Fixed formatter.maxMessageLength format (flat → nested)");
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
