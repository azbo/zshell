export type Platform = "linux" | "windows";
export type AuthType = "password" | "key";

export type Host = {
  id: string;
  name: string;
  address: string;
  port: number;
  username: string;
  platform: Platform;
  authType: AuthType;
  password?: string;
  hasPassword?: boolean;
  savePassword?: boolean;
  group?: string;
  favorite?: boolean;
  keyPath?: string;
  defaultShell?: string;
};

export type SocketMessage = {
  type: string;
  hostId?: string;
  password?: string;
  data?: string;
  cols?: number;
  rows?: number;
  message?: string;
};

export type RemoteEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mode: string;
  modTime: string;
};

export type RemoteListing = {
  path: string;
  entries: RemoteEntry[];
};

export type LocalListing = RemoteListing;

export type LocalTransferResult = {
  path: string;
};
