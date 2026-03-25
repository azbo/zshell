import type { Host } from "./types";

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
