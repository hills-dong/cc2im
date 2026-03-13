#!/usr/bin/env node
import { install, uninstall, start, stop, restart, status, logs } from "./service.js";

const USAGE = `cc2im - Claude Code to IM bridge

Usage:
  cc2im install [--config <path>]   Install as system service and start
  cc2im uninstall                   Stop and remove system service
  cc2im start                       Start the service
  cc2im stop                        Stop the service
  cc2im restart                     Restart the service
  cc2im status                      Show service status
  cc2im logs                        Tail service logs
  cc2im run                         Run in foreground (default)
`;

const command = process.argv[2] ?? "run";

switch (command) {
  case "install": {
    const configIdx = process.argv.indexOf("--config");
    const configPath = configIdx !== -1 ? process.argv[configIdx + 1] : undefined;
    install(configPath);
    break;
  }
  case "uninstall":
    uninstall();
    break;
  case "start":
    start();
    break;
  case "stop":
    stop();
    break;
  case "restart":
    restart();
    break;
  case "status":
    status();
    break;
  case "logs":
    logs();
    break;
  case "run": {
    const { main } = await import("./index.js");
    main().catch((err: Error) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
    break;
  }
  case "--help":
  case "-h":
  case "help":
    console.log(USAGE);
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    console.log(USAGE);
    process.exit(1);
}
