import { actions } from "astro:actions";
import type { Todo, Filter } from "./todo";
import {
  escapeHtml,
  formatDeadline,
  isDeadlineOverdue,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "./todo";

let todos: Todo[] = [];
let currentFilter: Filter = "all";
let addFormExpanded = false;
let editingId: string | null = null;

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

        <div class="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-[.bg-primary\\/5]:opacity-100 transition-opacity duration-200">
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

      ${
        todo.description || todo.deadline || todo.status !== "todo" || todo.priority !== "medium"
          ? `<div class="flex flex-wrap gap-1.5 mt-1.5 ml-[34px]">
              ${todo.status !== "todo" ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusBadgeClass(todo.status)}">${STATUS_LABELS[todo.status]}</span>` : ""}
              ${todo.priority !== "medium" ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${priorityBadgeClass(todo.priority)}">${PRIORITY_LABELS[todo.priority]}</span>` : ""}
              ${todo.deadline ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${deadlineBadgeClass(todo.deadline)}">${formatDeadline(todo.deadline)}</span>` : ""}
            </div>`
          : ""
      }
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

  document
    .getElementById("todo-form")!
    .addEventListener("submit", handleAddTodo);
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

  fetchTodos();
}

init();
