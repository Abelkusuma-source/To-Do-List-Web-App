import { actions } from "astro:actions";
import type { Todo, TaskAttachment, Filter } from "./todo";
import {
  escapeHtml,
  formatDeadline,
  isDeadlineOverdue,
  formatFileSize,
  getFileIcon,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "./todo";
import { authClient } from "../lib/auth-client";

let todos: Todo[] = [];
let currentFilter: Filter = "all";
let addFormExpanded = false;
let editingId: string | null = null;
// DOM refs
let inputEl: HTMLInputElement | null = null;
let descriptionEl: HTMLTextAreaElement | null = null;
let deadlineEl: HTMLInputElement | null = null;
let statusEl: HTMLSelectElement | null = null;
let priorityEl: HTMLSelectElement | null = null;
let listEl: HTMLElement | null = null;
let footerEl: HTMLElement | null = null;
let filterEl: HTMLElement | null = null;
let modalOverlayEl: HTMLElement | null = null;
let modalFormEl: HTMLFormElement | null = null;
let expandBtnEl: HTMLElement | null = null;
let logoutBtnEl: HTMLElement | null = null;

// Modal sub-refs
let editThumbnailContainerEl: HTMLElement | null = null;
let editThumbnailInputEl: HTMLInputElement | null = null;
let editAttachmentsListEl: HTMLElement | null = null;
let editAttachmentInputEl: HTMLInputElement | null = null;
let editDropZoneEl: HTMLElement | null = null;

function filteredTodos(): Todo[] {
  switch (currentFilter) {
    case "active":
      return todos.filter((t) => !t.done);
    case "completed":
      return todos.filter((t) => t.done);
    default:
      return todos;
  }
}

function activeCount(): number {
  return todos.filter((t) => !t.done).length;
}

function hasCompleted(): boolean {
  return todos.some((t) => t.done);
}

async function fetchTodos() {
  const { data, error } = await actions.getTodos();
  if (error) {
    console.error("Failed to fetch todos:", error);
    return;
  }
  todos = data ?? [];
  render();
}

function render(): void {
  renderList();
  renderFooter();
  renderFilterBar();
}

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "high":
      return "bg-error/10 text-error border-error/20";
    case "medium":
      return "bg-warning/10 text-warning border-warning/20";
    case "low":
      return "bg-info/10 text-info border-info/20";
    default:
      return "";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "done":
      return "bg-success/10 text-success border-success/20";
    case "in_progress":
      return "bg-primary/10 text-primary border-primary/20";
    case "todo":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "";
  }
}

function deadlineBadgeClass(dateStr: string): string {
  if (!dateStr) return "";
  return isDeadlineOverdue(dateStr)
    ? "bg-error/10 text-error border-error/20"
    : "bg-muted text-muted-foreground border-border";
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

function renderList(): void {
  const items = filteredTodos();
  if (!listEl) return;

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="text-center py-10 px-5">
        <span class="text-4xl block mb-3 opacity-60">📋</span>
        <p class="text-base font-semibold text-foreground m-0 mb-1">${
          todos.length === 0 ? "Belum ada tugas" : "Tidak ada tugas untuk filter ini"
        }</p>
        <p class="text-xs text-muted-foreground m-0">${
          todos.length === 0 ? "Tambahkan tugas baru di atas" : "Coba filter lain"
        }</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = items
    .map(
      (todo) => `
    <li class="flex flex-col px-3 py-2.5 bg-background border border-transparent rounded-md transition-all duration-200 animate-slideIn hover:border-border group ${
      todo.done ? "bg-success/5" : ""
    } ${
      editingId === todo.id
        ? "bg-primary/5 border-primary shadow-[0_0_0_2px_var(--color-primary-glow)]"
        : ""
    }" data-id="${todo.id}">
      <div class="flex items-center gap-2.5">
        ${
          todo.thumbnailUrl
            ? `<div class="size-10 shrink-0 rounded-md overflow-hidden border border-border">
                <img src="${escapeHtml(todo.thumbnailUrl)}" alt="" class="w-full h-full object-cover" loading="lazy" />
              </div>`
            : ""
        }

        <button class="flex items-center justify-center bg-none border-none cursor-pointer p-0.5 shrink-0 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 focus-visible:rounded-[6px]" data-action="toggle" data-id="${
          todo.id
        }" aria-label="${todo.done ? "Tandai belum selesai" : "Tandai selesai"}" tabindex="0">
          <span class="flex items-center justify-center size-[22px] border-2 border-border rounded-[6px] transition-all duration-200 ${
            todo.done
              ? "bg-success border-success"
              : "group-hover:border-primary group-hover:bg-primary/5"
          }">
            ${
              todo.done
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="size-[14px] text-white"><polyline points="20 6 9 17 4 12"/></svg>'
                : ""
            }
          </span>
        </button>

        <div class="flex-1 min-w-0">
          <span class="block text-[15px] text-foreground py-0.5 break-words leading-[1.4] cursor-text transition-colors duration-200 hover:text-primary ${
            todo.done ? "text-muted-foreground line-through" : ""
          }" data-id="${todo.id}">${escapeHtml(todo.title)}</span>

          ${
            todo.description
              ? `<span class="block text-xs text-muted-foreground mt-0.5 leading-relaxed">${escapeHtml(truncateText(todo.description, 60))}</span>`
              : ""
          }
        </div>

        <div class="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-[.bg-primary\\\\/5]:opacity-100 transition-opacity duration-200">
          <button class="flex items-center justify-center size-8 border-none bg-transparent rounded-md cursor-pointer text-muted-foreground transition-all duration-200 hover:text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1" data-action="edit" data-id="${
            todo.id
          }" aria-label="Edit tugas" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="flex items-center justify-center size-8 border-none bg-transparent rounded-md cursor-pointer text-muted-foreground transition-all duration-200 hover:text-error hover:bg-error/5 focus-visible:outline-2 focus-visible:outline-error focus-visible:outline-offset-1" data-action="delete" data-id="${
            todo.id
          }" aria-label="Hapus tugas" title="Hapus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5 mt-1.5 ml-[34px]">
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusBadgeClass(todo.status)}">${STATUS_LABELS[todo.status]}</span>
        ${todo.priority !== "medium" ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${priorityBadgeClass(todo.priority)}">${PRIORITY_LABELS[todo.priority]}</span>` : ""}
        ${todo.deadline ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${deadlineBadgeClass(todo.deadline)}">${formatDeadline(todo.deadline)}</span>` : ""}
      </div>
    </li>
  `
    )
    .join("");
}

function renderFooter(): void {
  const count = activeCount();
  if (!footerEl) return;
  const completed = hasCompleted();

  footerEl.innerHTML = `
    <span class="text-xs text-muted-foreground"><strong class="text-foreground font-bold">${count}</strong> ${count === 1 ? "tugas tersisa" : "tugas tersisa"}</span>
    <div>
      <button class="px-3.5 py-1.5 border border-border bg-transparent text-xs font-medium text-muted-foreground rounded-md cursor-pointer transition-all duration-200 hover:text-error hover:border-error hover:bg-error/5 ${
        completed ? "" : "opacity-0 pointer-events-none"
      }" data-action="clear-completed">Hapus selesai</button>
    </div>
  `;
}

function renderFilterBar(): void {
  if (!filterEl) return;
  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "Semua" },
    { value: "active", label: "Aktif" },
    { value: "completed", label: "Selesai" },
  ];

  filterEl.innerHTML = filters
    .map(
      (f) =>
        `<button class="flex-1 py-1.5 px-3 border-none bg-transparent text-xs font-medium text-muted-foreground rounded-[6px] cursor-pointer transition-all duration-200 hover:text-foreground hover:bg-background ${
          currentFilter === f.value
            ? "bg-background text-primary shadow-sm font-semibold"
            : ""
        }" data-filter="${f.value}">${f.label}</button>`
    )
    .join("");
}

function toggleAddFormExpanded(): void {
  addFormExpanded = !addFormExpanded;
  const detailsEl = document.getElementById("add-details");
  if (detailsEl) {
    detailsEl.classList.toggle("hidden", !addFormExpanded);
  }
  if (expandBtnEl) {
    expandBtnEl.classList.toggle("rotate-180", addFormExpanded);
  }
}

async function handleAddTodo(e: SubmitEvent): Promise<void> {
  e.preventDefault();
  if (!inputEl) return;
  const title = inputEl.value.trim();
  if (!title) return;

  const description = descriptionEl?.value.trim() ?? "";
  const deadline = deadlineEl?.value || null;
  const status = (statusEl?.value as Todo["status"]) ?? "todo";
  const priority = (priorityEl?.value as Todo["priority"]) ?? "medium";

  const { error } = await actions.addTodo({
    title,
    description,
    deadline,
    status,
    priority,
  });

  if (error) {
    console.error("Failed to add todo:", error);
    return;
  }

  inputEl.value = "";
  if (descriptionEl) descriptionEl.value = "";
  if (deadlineEl) deadlineEl.value = "";
  if (statusEl) statusEl.value = "todo";
  if (priorityEl) priorityEl.value = "medium";

  if (addFormExpanded) toggleAddFormExpanded();
  await fetchTodos();
}

async function handleListClick(e: MouseEvent): Promise<void> {
  const target = e.target as HTMLElement;
  const actionEl = target.closest("[data-action]") as HTMLElement | null;
  if (!actionEl) return;

  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;
  if (!id) return;

  switch (action) {
    case "toggle": {
      const todo = todos.find((t) => t.id === id);
      if (todo) {
        await actions.updateTodo({ id, done: !todo.done });
        await fetchTodos();
      }
      break;
    }
    case "edit": {
      openEditModal(id);
      break;
    }
    case "delete": {
      await actions.deleteTodo({ id });
      if (editingId === id) {
        editingId = null;
        closeEditModal();
      }
      await fetchTodos();
      break;
    }
  }
}

// ─── Image Compression (Client-Side) ─────────────────────────────────────────

/**
 * Compress an image file on the client before uploading.
 * Uses a canvas to downscale large images, reducing upload size and speed.
 * Returns a compressed blob that's typically 60-80% smaller than the original.
 */
function compressImage(file: File, maxDimension: number = 1200, quality: number = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Only downscale if larger than max dimension
      if (width <= maxDimension && height <= maxDimension) {
        // File is already small enough, return as-is (but maybe re-encode for WebP)
        // Just return the original file if it's already WebP
        if (file.type === "image/webp") {
          resolve(file);
          return;
        }
      }

      // Maintain aspect ratio
      if (width > height && width > maxDimension) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else if (height > maxDimension) {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;

      // Use bilinear interpolation for smoother downscaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to WebP for best compression
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // Fallback: resolve original file
            resolve(file);
          }
        },
        "image/webp",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal memproses gambar"));
    };
    img.src = url;
  });
}

/**
 * Compress an image file and return a new File with WebP extension.
 */
async function compressImageFile(file: File): Promise<File> {
  // Only compress images, skip non-image files
  if (!file.type.startsWith("image/")) return file;

  // Skip GIFs (animation would be lost)
  if (file.type === "image/gif") return file;

  // Small files (< 100KB) — skip compression overhead
  if (file.size < 100 * 1024) return file;

  try {
    const compressed = await compressImage(file);
    const newName = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([compressed], newName, { type: "image/webp" });
  } catch {
    return file; // Fallback to original
  }
}

// ─── Upload Queue ────────────────────────────────────────────────────────────

interface QueueTask {
  id: string;
  type: "thumbnail" | "attachment";
  file: File;
  taskId: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number; // 0-100
  error?: string;
}

let uploadQueue: QueueTask[] = [];
let activeUploads = 0;
const MAX_CONCURRENT_UPLOADS = 2;

function addUploadProgressEl(task: QueueTask): string {
  // Create a unique ID for the progress bar
  return `upload-progress-${task.id}`;
}

function renderUploadProgress(task: QueueTask): string {
  const barId = addUploadProgressEl(task);
  const fileName = task.file.name.length > 30
    ? task.file.name.slice(0, 27) + "…"
    : task.file.name;

  const icon = task.type === "thumbnail" ? "🖼️" : "📎";

  return `
    <div class="flex items-center gap-2.5 px-3 py-2 rounded-md bg-muted/50" data-upload-id="${task.id}">
      <span class="text-sm shrink-0">${icon}</span>
      <div class="flex-1 min-w-0">
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs text-foreground truncate">${escapeHtml(fileName)}</span>
          <span class="text-[10px] text-muted-foreground shrink-0 ml-2">${task.status === "uploading" ? task.progress + "%" : task.status === "done" ? "✓" : task.status === "error" ? "✗" : "..."}</span>
        </div>
        <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-300 ease-out ${
            task.status === "done"
              ? "bg-success"
              : task.status === "error"
                ? "bg-error"
                : "bg-primary"
          }" style="width: ${task.progress}%"></div>
        </div>
        ${task.error ? `<p class="text-[10px] text-error mt-1">${escapeHtml(task.error)}</p>` : ""}
      </div>
    </div>
  `;
}

function processQueue(): void {
  while (activeUploads < MAX_CONCURRENT_UPLOADS && uploadQueue.some((t) => t.status === "pending")) {
    const task = uploadQueue.find((t) => t.status === "pending")!;
    activeUploads++;
    task.status = "uploading";

    // Update progress display
    renderUploadProgressBar();

    // Execute the upload
    executeUpload(task).finally(() => {
      activeUploads--;
      processQueue();
    });
  }
}

function renderUploadProgressBar(): void {
  if (!editAttachmentsListEl) return;

  const activeTasks = uploadQueue.filter((t) => t.status !== "done");
  if (activeTasks.length === 0) return;

  // Find or create progress container
  let progressContainer = document.getElementById("upload-progress-container");
  if (!progressContainer) {
    progressContainer = document.createElement("div");
    progressContainer.id = "upload-progress-container";
    progressContainer.className = "space-y-1 mb-2";
    editAttachmentsListEl.parentElement?.insertBefore(
      progressContainer,
      editAttachmentsListEl,
    );
  }

  progressContainer.innerHTML = activeTasks
    .map((t) => renderUploadProgress(t))
    .join("");
}

function clearCompletedUploads(): void {
  uploadQueue = uploadQueue.filter((t) => t.status === "pending" || t.status === "uploading");
  const container = document.getElementById("upload-progress-container");
  if (container && uploadQueue.length === 0) {
    container.remove();
  }
}

async function executeUpload(task: QueueTask): Promise<void> {
  try {
    // Compress image before upload (client-side)
    const fileToUpload = task.type === "thumbnail"
      ? await compressImageFile(task.file)
      : task.file.type.startsWith("image/")
        ? await compressImageFile(task.file)
        : task.file;

    const fd = new FormData();
    fd.set("taskId", task.taskId);
    fd.set("file", fileToUpload);

    let result: { data?: any; error?: any };

    // Use indeterminate progress indicator (Astro Actions use fetch which
    // doesn't support real upload progress tracking via XHR)
    // Set progress to indeterminate state
    task.progress = 50; // "processing" state
    renderUploadProgressBar();

    if (task.type === "thumbnail") {
      result = await actions.uploadThumbnail(fd);

      if (result.error) {
        throw new Error(result.error.message || "Gagal mengunggah thumbnail");
      }

      task.progress = 100;

      // Update preview with returned URL
      renderThumbnailPreview(task.taskId, result.data?.url ?? null);
    } else {
      result = await actions.uploadAttachment(fd);

      if (result.error) {
        throw new Error(result.error.message || "Gagal mengunggah lampiran");
      }

      task.progress = 100;

      await loadAttachments(task.taskId);
    }

    task.status = "done";
    renderUploadProgressBar();

    // Clean up completed after a short delay
    setTimeout(clearCompletedUploads, 2000);

    if (task.type === "thumbnail") {
      await fetchTodos();
    }
  } catch (err) {
    task.status = "error";
    task.error = err instanceof Error ? err.message : "Terjadi kesalahan";
    renderUploadProgressBar();
  }
}

function queueUpload(type: "thumbnail" | "attachment", taskId: string, file: File): void {
  const task: QueueTask = {
    id: crypto.randomUUID(),
    type,
    file,
    taskId,
    status: "pending",
    progress: 0,
  };

  uploadQueue.push(task);
  renderUploadProgressBar();
  processQueue();
}

// ─── Thumbnail Upload ────────────────────────────────────────────────────────

async function uploadThumbnail(taskId: string, file: File): Promise<void> {
  // Show instant blob preview before upload
  const blobUrl = URL.createObjectURL(file);
  renderThumbnailPreview(taskId, blobUrl);

  // Queue the upload (will be compressed & processed)
  queueUpload("thumbnail", taskId, file);
}

function renderThumbnailPreview(taskId: string, url: string | null): void {
  if (!editThumbnailContainerEl) return;

  if (url) {
    editThumbnailContainerEl.innerHTML = `
      <div class="relative group rounded-lg overflow-hidden border border-border">
        <img src="${escapeHtml(url)}" alt="Thumbnail" class="w-full h-32 object-cover" />
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center gap-2">
          <button type="button" class="size-8 rounded-full bg-white/90 text-foreground hover:bg-white transition-colors flex items-center justify-center cursor-pointer" data-thumbnail-action="replace" title="Ganti gambar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </button>
          <button type="button" class="size-8 rounded-full bg-white/90 text-error hover:bg-white transition-colors flex items-center justify-center cursor-pointer" data-thumbnail-action="delete" title="Hapus gambar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `;

    // Attach event listeners
    editThumbnailContainerEl.querySelector("[data-thumbnail-action='replace']")?.addEventListener("click", () => {
      editThumbnailInputEl?.click();
    });
    editThumbnailContainerEl.querySelector("[data-thumbnail-action='delete']")?.addEventListener("click", async () => {
      // Revoke blob URL if it's a temporary one
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      const { error } = await actions.deleteThumbnail({ taskId });
      if (error) {
        console.error("Failed to delete thumbnail:", error);
        return;
      }
      renderThumbnailPreview(taskId, null);
      await fetchTodos();
    });
  } else {
    editThumbnailContainerEl.innerHTML = `
      <button type="button" class="w-full py-6 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-primary hover:bg-primary/5 transition-all duration-200 cursor-pointer flex flex-col items-center gap-1.5" data-thumbnail-action="add">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-6"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span class="text-xs">Tambahkan thumbnail</span>
      </button>
    `;

    editThumbnailContainerEl.querySelector("[data-thumbnail-action='add']")?.addEventListener("click", () => {
      editThumbnailInputEl?.click();
    });
  }
}

async function loadAttachments(taskId: string): Promise<void> {
  if (!editAttachmentsListEl) return;

  const { data, error } = await actions.getAttachments({ taskId });
  if (error) {
    console.error("Failed to load attachments:", error);
    return;
  }

  renderAttachments(taskId, data ?? []);
}

function renderAttachments(taskId: string, attachments: TaskAttachment[]): void {
  if (!editAttachmentsListEl) return;

  if (attachments.length === 0) {
    editAttachmentsListEl.innerHTML = `
      <p class="text-xs text-muted-foreground text-center py-4">Belum ada lampiran</p>
    `;
    return;
  }

  editAttachmentsListEl.innerHTML = attachments
    .map(
      (att) => `
    <div class="flex items-center gap-2.5 px-3 py-2 rounded-md bg-muted/50 group hover:bg-muted transition-colors" data-attachment-id="${att.id}">
      <span class="text-base shrink-0">${getFileIcon(att.mimeType)}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-foreground truncate">${escapeHtml(att.fileName)}</p>
        <p class="text-[11px] text-muted-foreground">${formatFileSize(att.fileSize)}</p>
      </div>
      <div class="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <a href="${escapeHtml(att.fileUrl)}" target="_blank" download="${escapeHtml(att.fileName)}" class="flex items-center justify-center size-7 border-none bg-transparent rounded text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all cursor-pointer" title="Unduh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </a>
        <button type="button" class="flex items-center justify-center size-7 border-none bg-transparent rounded text-muted-foreground hover:text-error hover:bg-error/5 transition-all cursor-pointer" data-attachment-action="delete" data-attachment-id="${att.id}" title="Hapus">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `
    )
    .join("");

  // Attach delete handlers
  editAttachmentsListEl.querySelectorAll("[data-attachment-action='delete']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const attachmentId = (btn as HTMLElement).dataset.attachmentId;
      if (!attachmentId) return;
      const { error } = await actions.deleteAttachment({ attachmentId });
      if (error) {
        console.error("Failed to delete attachment:", error);
        return;
      }
      await loadAttachments(taskId);
    });
  });
}

// ─── Edit Modal ──────────────────────────────────────────────────────────────

function openEditModal(id: string): void {
  editingId = id;
  const todo = todos.find((t) => t.id === id);
  if (!todo || !modalOverlayEl || !modalFormEl) return;

  (modalFormEl.querySelector("#edit-title") as HTMLInputElement)!.value = todo.title;
  (modalFormEl.querySelector("#edit-description") as HTMLTextAreaElement)!.value =
    todo.description;
  (modalFormEl.querySelector("#edit-deadline") as HTMLInputElement)!.value =
    todo.deadline || "";
  (modalFormEl.querySelector("#edit-status") as HTMLSelectElement)!.value = todo.status;
  (modalFormEl.querySelector("#edit-priority") as HTMLSelectElement)!.value = todo.priority;
  modalFormEl.dataset.id = id;

  // Render thumbnail
  renderThumbnailPreview(id, todo.thumbnailUrl);

  // Load attachments
  loadAttachments(id);

  modalOverlayEl.classList.remove("hidden");
  modalOverlayEl.classList.add("flex");
  requestAnimationFrame(() => {
    (modalFormEl.querySelector("#edit-title") as HTMLInputElement)?.focus();
  });
}

function closeEditModal(): void {
  editingId = null;
  if (modalOverlayEl) {
    modalOverlayEl.classList.add("hidden");
    modalOverlayEl.classList.remove("flex");
  }
}

async function handleEditSubmit(e: SubmitEvent): Promise<void> {
  e.preventDefault();
  if (!modalFormEl) return;

  const id = modalFormEl.dataset.id;
  if (!id) return;

  const title = (modalFormEl.querySelector("#edit-title") as HTMLInputElement).value.trim();
  if (!title) return;

  const description = (
    modalFormEl.querySelector("#edit-description") as HTMLTextAreaElement
  ).value.trim();
  const deadline = (
    modalFormEl.querySelector("#edit-deadline") as HTMLInputElement
  ).value || null;
  const status = (
    modalFormEl.querySelector("#edit-status") as HTMLSelectElement
  ).value as Todo["status"];
  const priority = (
    modalFormEl.querySelector("#edit-priority") as HTMLSelectElement
  ).value as Todo["priority"];

  const { error } = await actions.updateTodo({
    id,
    title,
    description,
    deadline,
    status,
    priority,
  });

  if (error) {
    console.error("Failed to update todo:", error);
    return;
  }

  closeEditModal();
  await fetchTodos();
}

function handleFilterClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const filterBtn = target.closest("[data-filter]") as HTMLElement | null;
  if (!filterBtn) return;

  const filter = filterBtn.dataset.filter as Filter;
  if (filter !== currentFilter) {
    currentFilter = filter;
    render();
  }
}

async function handleFooterClick(e: MouseEvent): Promise<void> {
  const target = e.target as HTMLElement;
  const clearBtn = target.closest(
    '[data-action="clear-completed"]'
  ) as HTMLElement | null;
  if (!clearBtn) return;

  await actions.clearCompleted();
  await fetchTodos();
}

function handleModalBackdropClick(e: MouseEvent): void {
  if (e.target === modalOverlayEl) {
    closeEditModal();
  }
}

function handleModalKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    closeEditModal();
  }
}

// ─── Drag & Drop Upload Zone ────────────────────────────────────────────────

function setupThumbnailDropZone(): void {
  if (!editThumbnailContainerEl) return;

  let dragCounter = 0;

  editThumbnailContainerEl.addEventListener("dragenter", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (dragCounter === 1) {
      editThumbnailContainerEl?.classList.add("ring-2", "ring-primary", "rounded-lg");
    }
  });

  editThumbnailContainerEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  editThumbnailContainerEl.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter === 0) {
      editThumbnailContainerEl?.classList.remove("ring-2", "ring-primary");
    }
  });

  editThumbnailContainerEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    editThumbnailContainerEl?.classList.remove("ring-2", "ring-primary");

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    const taskId = modalFormEl?.dataset.id;
    if (!taskId) return;

    const allowedTypes = ["image/png", "image/jpg", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      console.warn(`Tipe file thumbnail tidak didukung: ${file.type}`);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      console.warn(`File thumbnail terlalu besar: ${file.name}`);
      return;
    }

    await uploadThumbnail(taskId, file);
  });
}

function setupDragDropZone(): void {
  if (!editDropZoneEl) return;

  let dragCounter = 0;

  editDropZoneEl.addEventListener("dragenter", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    editDropZoneEl?.classList.add("border-primary", "bg-primary/5");
  });

  editDropZoneEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  editDropZoneEl.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter === 0) {
      editDropZoneEl?.classList.remove("border-primary", "bg-primary/5");
    }
  });

  editDropZoneEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    editDropZoneEl?.classList.remove("border-primary", "bg-primary/5");

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const taskId = modalFormEl?.dataset.id;
    if (!taskId) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip",
        "text/plain",
        "image/png",
        "image/jpg",
        "image/jpeg",
      ];

      if (!allowedTypes.includes(file.type)) {
        console.warn(`File type not supported: ${file.type}`);
        continue;
      }

      if (file.size > 20 * 1024 * 1024) {
        console.warn(`File too large: ${file.name}`);
        continue;
      }

      queueUpload("attachment", taskId, file);
    }
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────

// ─── Auth Handling ───────────────────────────────────────────────────────────

async function handleLogout(): Promise<void> {
  await authClient.signOut({
    fetchOptions: {
      onSuccess: () => {
        window.location.href = "/login";
      },
    },
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────

function init(): void {
  inputEl = document.getElementById("todo-input") as HTMLInputElement;
  descriptionEl = document.getElementById("todo-description") as HTMLTextAreaElement;
  deadlineEl = document.getElementById("todo-deadline") as HTMLInputElement;
  statusEl = document.getElementById("todo-status") as HTMLSelectElement;
  priorityEl = document.getElementById("todo-priority") as HTMLSelectElement;
  listEl = document.getElementById("todo-list")!;
  footerEl = document.getElementById("todo-footer")!;
  filterEl = document.getElementById("filter-bar")!;
  modalOverlayEl = document.getElementById("edit-modal-overlay")!;
  modalFormEl = document.getElementById("edit-modal-form") as HTMLFormElement;
  expandBtnEl = document.getElementById("expand-btn");
  logoutBtnEl = document.getElementById("logout-btn");

  // Modal sub-refs
  editThumbnailContainerEl = document.getElementById("edit-thumbnail-container");
  editThumbnailInputEl = document.getElementById("edit-thumbnail-input") as HTMLInputElement;
  editAttachmentsListEl = document.getElementById("edit-attachments-list");
  editAttachmentInputEl = document.getElementById("edit-attachment-input") as HTMLInputElement;
  editDropZoneEl = document.getElementById("edit-drop-zone");

  // Event listeners
  document.getElementById("todo-form")!.addEventListener("submit", handleAddTodo);
  listEl.addEventListener("click", handleListClick);
  filterEl.addEventListener("click", handleFilterClick);
  footerEl.addEventListener("click", handleFooterClick);

  if (modalOverlayEl) {
    modalOverlayEl.addEventListener("click", handleModalBackdropClick);
  }
  if (modalFormEl) {
    modalFormEl.addEventListener("submit", handleEditSubmit);
  }
  document.addEventListener("keydown", handleModalKeydown);

  if (expandBtnEl) {
    expandBtnEl.addEventListener("click", toggleAddFormExpanded);
  }

  if (logoutBtnEl) {
    logoutBtnEl.addEventListener("click", handleLogout);
  }

  // Thumbnail input
  if (editThumbnailInputEl) {
    editThumbnailInputEl.addEventListener("change", async () => {
      const taskId = modalFormEl?.dataset.id;
      if (!taskId || !editThumbnailInputEl.files?.[0]) return;
      await uploadThumbnail(taskId, editThumbnailInputEl.files[0]);
      editThumbnailInputEl.value = "";
    });
  }

  // Attachment input
  if (editAttachmentInputEl) {
    editAttachmentInputEl.addEventListener("change", async () => {
      const taskId = modalFormEl?.dataset.id;
      if (!taskId || !editAttachmentInputEl.files) return;
      for (let i = 0; i < editAttachmentInputEl.files.length; i++) {
        const file = editAttachmentInputEl.files[i];
        queueUpload("attachment", taskId, file);
      }
      editAttachmentInputEl.value = "";
    });
  }

  // Drag & drop zones
  setupThumbnailDropZone();
  setupDragDropZone();

  // Fetch todos
  fetchTodos();
}

init();
