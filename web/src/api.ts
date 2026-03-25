import type { Host, LocalListing, LocalTransferResult, RemoteEntry, RemoteListing } from "./types";

export async function loadHosts(): Promise<Host[]> {
  const response = await fetch("/api/hosts");
  return (await response.json()) as Host[];
}

export async function saveHost(host: Omit<Host, "id">, id = ""): Promise<Host> {
  const response = await fetch(id ? `/api/hosts/${id}` : "/api/hosts", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(host),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error || "保存失败");
  }
  return (await response.json()) as Host;
}

export async function deleteHost(id: string): Promise<void> {
  const response = await fetch(`/api/hosts/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error || "删除失败");
  }
}

export async function listFiles(hostID: string, path: string, password: string): Promise<RemoteListing> {
  const response = await fetch(`/api/files/${hostID}/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, password }),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error || "读取目录失败");
  }
  return (await response.json()) as RemoteListing;
}

export async function listLocalFiles(path: string): Promise<LocalListing> {
  const response = await fetch("/api/local/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error || "读取本地目录失败");
  }
  return (await response.json()) as LocalListing;
}

export async function uploadFile(hostID: string, path: string, password: string, file: File): Promise<RemoteEntry> {
  const form = new FormData();
  form.set("path", path);
  form.set("password", password);
  form.set("file", file);

  const response = await fetch(`/api/files/${hostID}/upload`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error || "上传失败");
  }
  return (await response.json()) as RemoteEntry;
}

export async function downloadFile(hostID: string, path: string, password: string): Promise<Blob> {
  const response = await fetch(`/api/files/${hostID}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, password }),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error || "下载失败");
  }
  return await response.blob();
}

export async function uploadLocalFilePath(
  hostID: string,
  path: string,
  password: string,
  localPath: string,
): Promise<RemoteEntry> {
  const response = await fetch(`/api/files/${hostID}/upload-path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, password, localPath }),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error || "上传失败");
  }
  return (await response.json()) as RemoteEntry;
}

export async function downloadFileToLocal(
  hostID: string,
  path: string,
  password: string,
  localPath: string,
): Promise<LocalTransferResult> {
  const response = await fetch(`/api/files/${hostID}/download-to-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, password, localPath }),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error || "下载失败");
  }
  return (await response.json()) as LocalTransferResult;
}
