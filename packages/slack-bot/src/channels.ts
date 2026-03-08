export interface ChannelConfig {
  main: string;
  dev: string;
  design: string;
  alerts: string;
}

export class ChannelRouter {
  constructor(private channels: ChannelConfig) {}

  getMainChannel(): string {
    return this.channels.main;
  }

  getDevChannel(): string {
    return this.channels.dev;
  }

  getDesignChannel(): string {
    return this.channels.design;
  }

  getAlertsChannel(): string {
    return this.channels.alerts;
  }

  routeByEventType(eventType: string): string {
    if (eventType.startsWith('ci.') || eventType.startsWith('deploy.')) {
      return this.channels.alerts;
    }

    if (eventType.startsWith('pr.') || eventType.startsWith('build.')) {
      return this.channels.dev;
    }

    if (eventType.startsWith('design.') || eventType.startsWith('requirements.')) {
      return this.channels.design;
    }

    return this.channels.main;
  }
}
