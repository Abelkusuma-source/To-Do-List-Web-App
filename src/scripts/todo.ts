export interface Todo {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

export type Filter = 'all' | 'active' | 'completed';

function generateId(): string {
  return crypto.randomUUID();
}

function getTodosFromStorage(): Todo[] {
  try {
    const data = localStorage.getItem('todos');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveTodos(todos: Todo[]): void {
  localStorage.setItem('todos', JSON.stringify(todos));
}

export function getTodos(): Todo[] {
  return getTodosFromStorage();
}

export function addTodo(title: string): Todo {
  const todo: Todo = {
    id: generateId(),
    title: title.trim(),
    done: false,
    createdAt: Date.now(),
  };
  const todos = getTodosFromStorage();
  todos.push(todo);
  saveTodos(todos);
  return todo;
}

export function updateTodo(id: string, updates: Partial<Pick<Todo, 'title' | 'done'>>): Todo | null {
  const todos = getTodosFromStorage();
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) return null;

  todos[index] = { ...todos[index], ...updates };
  saveTodos(todos);
  return todos[index];
}

export function deleteTodo(id: string): boolean {
  const todos = getTodosFromStorage();
  const filtered = todos.filter(t => t.id !== id);
  if (filtered.length === todos.length) return false;
  saveTodos(filtered);
  return true;
}

export function clearCompleted(): void {
  const todos = getTodosFromStorage();
  saveTodos(todos.filter(t => !t.done));
}
