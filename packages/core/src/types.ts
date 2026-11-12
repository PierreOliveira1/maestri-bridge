export interface HostAddress {
  host: string;
  port: number;
}

export interface PinnedHost extends HostAddress {
  pin: string;
}

export type DeviceRole = 'owner' | 'guest' | (string & {});

export interface Credentials extends PinnedHost {
  token: string;
  deviceId: string;
  deviceName: string;
  role: DeviceRole;
}
