import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, Sample, Session } from "./types";

export async function listSessions(): Promise<Session[]> {
  return invoke<Session[]>("list_sessions");
}

export async function getSession(id: number): Promise<Session | null> {
  return invoke<Session | null>("get_session", { id });
}

export async function getSamples(sessionId: number): Promise<Sample[]> {
  return invoke<Sample[]>("get_samples", { sessionId });
}

export async function deleteSession(id: number): Promise<void> {
  return invoke<void>("delete_session", { id });
}

export async function getConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("get_config");
}

export async function setWatchedFolder(folder: string): Promise<AppConfig> {
  return invoke<AppConfig>("set_watched_folder", { folder });
}

export async function rescan(): Promise<void> {
  return invoke<void>("rescan");
}
