import { App } from '@slack/bolt';
import type { EventBus } from '@devteam/shared';
import type { TeamIdentityManager } from './identity.js';
import type { ChannelRouter } from './channels.js';

export interface SlackBotConfig {
  botToken: string;
  signingSecret: string;
  appToken?: string; // For socket mode
  identityManager: TeamIdentityManager;
  channelRouter: ChannelRouter;
  eventBus: EventBus;
}

export function createSlackBot(config: SlackBotConfig): App {
  const app = new App({
    token: config.botToken,
    signingSecret: config.signingSecret,
    socketMode: !!config.appToken,
    appToken: config.appToken,
  });

  // Set up event listeners (implemented in Task 10)

  return app;
}
