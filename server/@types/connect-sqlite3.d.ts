declare module 'connect-sqlite3' {
  import session from 'express-session';
  import { Database } from 'better-sqlite3';

  interface SqliteStoreOptions {
    db?: string;
    dir?: string;
    table?: string;
    ttl?: number;
  }

  function connectSqlite3(session: typeof import('express-session')): {
    new (options?: SqliteStoreOptions): session.Store;
  };

  export = connectSqlite3;
}
