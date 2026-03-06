import type { Connection, ConnectionOpts } from './connection.js'

export interface Node {
  readonly id: string
  readonly label: string
  to(target: Node, label?: string, opts?: ConnectionOpts): Connection
  toJSON(): unknown
}

export type ConnectionRegistrar = (conn: Connection) => void
