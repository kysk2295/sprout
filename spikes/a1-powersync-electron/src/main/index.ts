import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { createConsoleLogger, LogLevels, PowerSyncDatabase, SyncStatus, SyncStreamConnectionMethod } from '@powersync/node';
import { app, BrowserWindow, ipcMain, MessagePortMain } from 'electron';
import { AppSchema, BackendConnector } from './powersync';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Seeded by backend/demos/nodejs/init-scripts/setup.sql
const SEED_LIST_ID = '75f89104-d95a-4f16-8309-5363f1bb377a';
const CONTROL_PORT = 7777;

// SyncStatus has no toJSON() in the installed @powersync/node; pick the fields we report.
const statusJson = (s: SyncStatus) => ({
  connected: s.connected,
  connecting: s.connecting,
  hasSynced: s.hasSynced,
  lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
  uploading: s.dataFlowStatus?.uploading ?? false,
  downloading: s.dataFlowStatus?.downloading ?? false
});

if (require('electron-squirrel-startup')) {
  app.quit();
}

const userDataDirectory = app.getPath('userData');
try {
  if (!fs.existsSync(userDataDirectory)) {
    fs.mkdirSync(userDataDirectory);
  }
} catch (e) {
  console.error('Could not create database directory', e);
}

console.log('Storing data in ', userDataDirectory);

// Stable user id per install, so the backend issues the same JWT subject across restarts.
const userIdFile = path.join(userDataDirectory, 'spike-user-id');
const userId = fs.existsSync(userIdFile) ? fs.readFileSync(userIdFile, 'utf8').trim() : randomUUID();
fs.writeFileSync(userIdFile, userId);

const database = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'test.db',
    dbLocation: userDataDirectory,
    openWorker(_, options) {
      return new Worker(new URL('./worker.ts', import.meta.url), options);
    }
  },
  logger: createConsoleLogger({ minLevel: LogLevels.warn })
});

// A1 spike: local control port so the sync can be exercised from curl without a UI.
//   GET  /status          -> sync status + row counts
//   GET  /todos           -> local todos
//   POST /todos {description} -> local insert (queued for upload)
const startControlServer = () => {
  http
    .createServer(async (req, res) => {
      const reply = (code: number, body: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body, null, 2));
      };
      try {
        if (req.method === 'GET' && req.url === '/status') {
          const status = statusJson(database.currentStatus);
          const { count: todos } = await database.get<{ count: number }>('SELECT count(*) AS count FROM todos');
          const { count: pending } = await database.get<{ count: number }>('SELECT count(*) AS count FROM ps_crud');
          return reply(200, { userId, status, todos, pendingUploads: pending });
        }
        if (req.method === 'GET' && req.url === '/todos') {
          return reply(200, await database.getAll('SELECT id, description, completed FROM todos ORDER BY created_at'));
        }
        if (req.method === 'POST' && req.url === '/todos') {
          let raw = '';
          for await (const chunk of req) raw += chunk;
          const { description } = JSON.parse(raw || '{}');
          const id = randomUUID();
          await database.execute(
            'INSERT INTO todos (id, list_id, created_at, description, completed, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [id, SEED_LIST_ID, new Date().toISOString(), description ?? 'spike todo', 0, userId]
          );
          return reply(201, { id });
        }
        reply(404, { error: 'not found' });
      } catch (e: any) {
        reply(500, { error: String(e?.message ?? e) });
      }
    })
    .listen(CONTROL_PORT, '127.0.0.1', () => console.log(`[spike] control server on http://127.0.0.1:${CONTROL_PORT}`));
};

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    height: 600,
    width: 800,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY
    }
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
};

app.whenReady().then(async () => {
  const version = await database.get<{ v: string }>('SELECT powersync_rs_version() AS v');
  console.log(`[spike] powersync core extension loaded: ${version.v}`);

  let lastConnected: boolean | undefined;
  database.registerListener({
    statusChanged(status) {
      if (status.connected !== lastConnected) {
        lastConnected = status.connected;
        console.log(`[spike] sync connected=${status.connected} hasSynced=${status.hasSynced}`);
      }
    }
  });

  database.watchWithCallback('SELECT count(*) AS count FROM todos', [], {
    onResult(results) {
      console.log(`[spike] local todos count=${results.rows._array[0].count}`);
    }
  });

  database.connect(new BackendConnector(userId), { connectionMethod: SyncStreamConnectionMethod.HTTP });
  startControlServer();

  const forwardSyncStatus = (port: MessagePortMain) => {
    port.postMessage(statusJson(database.currentStatus));
    const unregister = database.registerListener({
      statusChanged(status) {
        port.postMessage(statusJson(status));
      }
    });
    port.once('close', unregister);
  };

  const forwardWatchResults = (sql: string, args: any[], port: MessagePortMain) => {
    const abort = new AbortController();
    port.once('close', () => abort.abort());

    database.watchWithCallback(
      sql,
      args,
      {
        onResult(results) {
          port.postMessage(results.rows._array);
        },
        onError(error) {
          console.error(`Watch ${sql} with ${args} failed`, error);
        }
      },
      { signal: abort.signal }
    );
  };

  ipcMain.on('port', (portEvent) => {
    const [port] = portEvent.ports;
    port.start();

    port.on('message', (event) => {
      const { method, payload } = event.data;
      switch (method) {
        case 'syncStatus':
          forwardSyncStatus(port);
          break;
        case 'watch':
          const { sql, args } = payload;
          forwardWatchResults(sql, args, port);
          break;
      }
    });
  });

  ipcMain.handle('get', async (_, sql: string, args: any[]) => {
    return await database.get(sql, args);
  });
  ipcMain.handle('getAll', async (_, sql: string, args: any[]) => {
    return await database.getAll(sql, args);
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
