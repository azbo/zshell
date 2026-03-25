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
