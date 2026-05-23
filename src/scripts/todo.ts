export interface Todo {
  id: string;
  title: string;
  description: string;
  done: boolean;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  deadline: string | null;
  thumbnailUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
}

export type Filter = "all" | "active" | "completed";

export function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function formatDeadline(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() < today.getTime() && date.toDateString() !== today.toDateString()) return "Terlambat";
  if (date.toDateString() === today.toDateString()) return "Hari ini";
  if (date.toDateString() === tomorrow.toDateString()) return "Besok";
  return date.toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function isDeadlineOverdue(dateStr: string): boolean {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.includes("wordprocessingml")) return "📝";
  if (mimeType === "application/zip" || mimeType.includes("zip")) return "📦";
  if (mimeType === "text/plain") return "📃";
  return "📎";
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

export const STATUS_LABELS: Record<string, string> = {
  todo: "Belum",
  in_progress: "Diproses",
  done: "Selesai",
};
