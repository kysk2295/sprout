import { AbstractPowerSyncDatabase, column, PowerSyncBackendConnector, Schema, Table } from '@powersync/node';

declare const POWERSYNC_URL: string | null;
declare const BACKEND_URL: string | null;

// A1 spike: talks to the self-hosted demo backend (spikes/a1-powersync-electron/backend).
// GET  /api/auth/token?user_id=...  -> { token }
// POST /api/data  { batch: [{ op, table, id, data }] }
export class BackendConnector implements PowerSyncBackendConnector {
  constructor(private readonly userId: string) {}

  async fetchCredentials() {
    if (!POWERSYNC_URL || !BACKEND_URL) {
      return null;
    }

    const res = await fetch(`${BACKEND_URL}/api/auth/token?user_id=${this.userId}`);
    if (!res.ok) {
      throw new Error(`Received ${res.status} from /api/auth/token: ${await res.text()}`);
    }
    const body = await res.json();

    return {
      endpoint: POWERSYNC_URL,
      token: body.token
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) {
      return;
    }

    const batch = transaction.crud.map((operation) => ({
      op: operation.op,
      table: operation.table,
      id: operation.id,
      data: operation.opData
    }));

    // Throwing leaves the transaction queued; PowerSync retries after a delay (e.g. while offline).
    const response = await fetch(`${BACKEND_URL}/api/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch })
    });
    if (!response.ok) {
      throw new Error(`Received ${response.status} from /api/data: ${await response.text()}`);
    }

    console.log(`[spike] uploaded ${batch.length} op(s):`, batch.map((b) => `${b.op} ${b.table}/${b.id}`).join(', '));
    await transaction.complete();
  }
}

export const LIST_TABLE = 'lists';
export const TODO_TABLE = 'todos';

const todos = new Table(
  {
    list_id: column.text,
    created_at: column.text,
    completed_at: column.text,
    description: column.text,
    created_by: column.text,
    completed_by: column.text,
    completed: column.integer,
    photo_id: column.text
  },
  { indexes: { list: ['list_id'] } }
);

const lists = new Table({
  created_at: column.text,
  name: column.text,
  owner_id: column.text
});

export const AppSchema = new Schema({
  lists,
  todos
});

export type Database = (typeof AppSchema)['types'];
export type TodoRecord = Database['todos'];
export type ListRecord = Database['lists'];
