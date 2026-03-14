import type { AppConfig, Platform, ProjectConfig, IncomingMessage, Reaction } from "./types.js";
import { Store } from "./store.js";

interface ChannelMapping {
  platform: Platform;
  projectName: string;
}

export class Router {
  private channelMap = new Map<string, ChannelMapping>();

  constructor(
    private config: AppConfig,
    private store: Store,
  ) {}

  registerChannel(channelId: string, platform: Platform, projectName: string): void {
    this.channelMap.set(`${platform}:${channelId}`, { platform, projectName });
  }

  getProject(channelId: string, platform: Platform): ProjectConfig | null {
    const mapping = this.channelMap.get(`${platform}:${channelId}`);
    if (!mapping) return null;
    return this.config.projects.find(p => p.name === mapping.projectName) ?? null;
  }

  getSessionId(threadId: string, platform: Platform): string | null {
    const thread = this.store.getThread(threadId, platform);
    return thread?.session_id ?? null;
  }

  isManagementCommand(content: string): boolean {
    return /^\/im-(add-project|remove-project|list-projects|reload-config|done|reopen)/.test(content);
  }

  parseManagementCommand(content: string): { command: string; args: string[] } | null {
    const match = content.match(/^\/im-(\S+)\s*(.*)/);
    if (!match) return null;
    return {
      command: match[1],
      args: match[2].trim().split(/\s+/).filter(Boolean),
    };
  }
}
