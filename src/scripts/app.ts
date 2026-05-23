import type { Todo, Filter } from './todo';
import { getTodos, addTodo, updateTodo, deleteTodo, clearCompleted } from './todo';

let todos: Todo[] = getTodos();
let currentFilter: Filter = 'all';
let editingId: string | null = null;

const appEl = document.getElementById('app')!;
let inputEl: HTMLInputElement | null = null;
let listEl: HTMLElement | null = null;
let footerEl: HTMLElement | null = null;
let filterEl: HTMLElement | null = null;

function filteredTodos(): Todo[] {
  switch (currentFilter) {
    case 'active': return todos.filter(t => !t.done);
    case 'completed': return todos.filter(t => t.done);
    default: return todos;
  }
}

function activeCount(): number {
  return todos.filter(t => !t.done).length;
}

function hasCompleted(): boolean {
  return todos.some(t => t.done);
}

function render(): void {
  renderList();
  renderFooter();
  renderFilterBar();
}

function renderList(): void {
  const items = filteredTodos();
  if (!listEl) return;

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="text-center py-10 px-5">
        <span class="text-4xl block mb-3 opacity-60">📋</span>
        <p class="text-base font-semibold text-foreground m-0 mb-1">${todos.length === 0 ? 'Belum ada tugas' : 'Tidak ada tugas untuk filter ini'}</p>
        <p class="text-xs text-muted-foreground m-0">${todos.length === 0 ? 'Tambahkan tugas baru di atas' : 'Coba filter lain'}</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = items.map(todo => `
    <li class="flex items-center gap-2.5 px-3 py-2.5 bg-background border border-transparent rounded-md transition-all duration-200 animate-slideIn hover:border-border group ${todo.done ? 'bg-success/5' : ''} ${editingId === todo.id ? 'bg-primary/5 border-primary shadow-[0_0_0_2px_var(--color-primary-glow)]' : ''}" data-id="${todo.id}">
      <button class="flex items-center justify-center bg-none border-none cursor-pointer p-0.5 shrink-0 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 focus-visible:rounded-[6px]" data-action="toggle" data-id="${todo.id}" aria-label="${todo.done ? 'Tandai belum selesai' : 'Tandai selesai'}" tabindex="0">
        <span class="flex items-center justify-center size-[22px] border-2 border-border rounded-[6px] transition-all duration-200 ${todo.done ? 'bg-success border-success' : 'group-hover:border-primary group-hover:bg-primary/5'}">
          ${todo.done ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="size-[14px] text-white"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
        </span>
      </button>

      ${editingId === todo.id
        ? `<form class="flex flex-1" data-id="${todo.id}" data-edit-form>
            <input class="flex-1 border-none bg-transparent text-[15px] text-foreground py-0.5 outline-none border-b-2 border-primary min-w-0" type="text" value="${escapeHtml(todo.title)}" data-edit-input autofocus />
           </form>`
        : `<span class="flex-1 text-[15px] text-foreground cursor-text py-0.5 break-words leading-[1.4] transition-colors duration-200 hover:text-primary ${todo.done ? 'text-muted-foreground line-through' : ''}" data-id="${todo.id}">${escapeHtml(todo.title)}</span>`
      }

      <div class="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-[.bg-primary\/5]:opacity-100 transition-opacity duration-200">
        <button class="flex items-center justify-center size-8 border-none bg-transparent rounded-md cursor-pointer text-muted-foreground transition-all duration-200 hover:text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1" data-action="${editingId === todo.id ? 'cancel-edit' : 'edit'}" data-id="${todo.id}" aria-label="Edit tugas" title="Edit">
          ${editingId === todo.id
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
          }
        </button>
        <button class="flex items-center justify-center size-8 border-none bg-transparent rounded-md cursor-pointer text-muted-foreground transition-all duration-200 hover:text-error hover:bg-error/5 focus-visible:outline-2 focus-visible:outline-error focus-visible:outline-offset-1" data-action="delete" data-id="${todo.id}" aria-label="Hapus tugas" title="Hapus">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </li>
  `).join('');
}

function renderFooter(): void {
  const count = activeCount();
  if (!footerEl) return;
  const completed = hasCompleted();

  footerEl.innerHTML = `
    <span class="text-xs text-muted-foreground"><strong class="text-foreground font-bold">${count}</strong> ${count === 1 ? 'tugas tersisa' : 'tugas tersisa'}</span>
    <div>
      <button class="px-3.5 py-1.5 border border-border bg-transparent text-xs font-medium text-muted-foreground rounded-md cursor-pointer transition-all duration-200 hover:text-error hover:border-error hover:bg-error/5 ${completed ? '' : 'opacity-0 pointer-events-none'}" data-action="clear-completed">Hapus selesai</button>
    </div>
  `;
}

function renderFilterBar(): void {
  if (!filterEl) return;
  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Semua' },
    { value: 'active', label: 'Aktif' },
    { value: 'completed', label: 'Selesai' },
  ];

  filterEl.innerHTML = filters.map(f =>
    `<button class="flex-1 py-1.5 px-3 border-none bg-transparent text-xs font-medium text-muted-foreground rounded-[6px] cursor-pointer transition-all duration-200 hover:text-foreground hover:bg-background ${currentFilter === f.value ? 'bg-background text-primary shadow-sm font-semibold' : ''}" data-filter="${f.value}">${f.label}</button>`
  ).join('');
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleAddTodo(e: SubmitEvent): void {
  e.preventDefault();
  if (!inputEl) return;
  const title = inputEl.value.trim();
  if (!title) return;

  addTodo(title);
  todos = getTodos();
  inputEl.value = '';
  render();
}

function handleListClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const actionEl = target.closest('[data-action]') as HTMLElement | null;
  if (!actionEl) return;

  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;
  if (!id) return;

  switch (action) {
    case 'toggle': {
      const todo = todos.find(t => t.id === id);
      if (todo) {
        updateTodo(id, { done: !todo.done });
        todos = getTodos();
        render();
      }
      break;
    }
    case 'edit': {
      editingId = id;
      render();
      requestAnimationFrame(() => {
        const editInput = document.querySelector(`[data-edit-input]`) as HTMLInputElement;
        if (editInput) {
          editInput.focus();
          editInput.select();
        }
      });
      break;
    }
    case 'cancel-edit': {
      editingId = null;
      render();
      break;
    }
    case 'delete': {
      deleteTodo(id);
      todos = getTodos();
      if (editingId === id) editingId = null;
      render();
      break;
    }
  }
}

function handleEditSubmit(e: SubmitEvent): void {
  const form = e.target as HTMLFormElement;
  if (!form.hasAttribute('data-edit-form')) return;

  e.preventDefault();
  const id = form.dataset.id;
  if (!id) return;

  const input = form.querySelector('[data-edit-input]') as HTMLInputElement;
  const title = input.value.trim();
  if (title) {
    updateTodo(id, { title });
    todos = getTodos();
  }
  editingId = null;
  render();
}

function handleEditKeydown(e: KeyboardEvent): void {
  const input = e.target as HTMLInputElement;
  if (!input.hasAttribute('data-edit-input')) return;
  if (e.key === 'Escape') {
    editingId = null;
    render();
  }
}

function handleEditBlur(e: FocusEvent): void {
  const input = e.target as HTMLInputElement;
  if (!input.hasAttribute('data-edit-input')) return;
  setTimeout(() => {
    if (editingId) {
      const title = input.value.trim();
      if (title) {
        updateTodo(editingId, { title });
        todos = getTodos();
      }
      editingId = null;
      render();
    }
  }, 150);
}

function handleFilterClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const filterBtn = target.closest('[data-filter]') as HTMLElement | null;
  if (!filterBtn) return;

  const filter = filterBtn.dataset.filter as Filter;
  if (filter !== currentFilter) {
    currentFilter = filter;
    render();
  }
}

function handleFooterClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const clearBtn = target.closest('[data-action="clear-completed"]') as HTMLElement | null;
  if (!clearBtn) return;

  clearCompleted();
  todos = getTodos();
  render();
}

function init(): void {
  inputEl = document.getElementById('todo-input') as HTMLInputElement;
  listEl = document.getElementById('todo-list')!;
  footerEl = document.getElementById('todo-footer')!;
  filterEl = document.getElementById('filter-bar')!;

  inputEl.form!.addEventListener('submit', handleAddTodo);
  listEl.addEventListener('click', handleListClick);
  listEl.addEventListener('submit', handleEditSubmit);
  listEl.addEventListener('keydown', handleEditKeydown);
  listEl.addEventListener('focusout', handleEditBlur);
  filterEl.addEventListener('click', handleFilterClick);
  footerEl.addEventListener('click', handleFooterClick);

  render();
}

init();
