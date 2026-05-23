export interface Todo {
  id: string;
  title: string;
  description: string;
  done: boolean;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  deadline: string | null;
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
