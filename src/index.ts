import { MutexRW } from 'mutex-ts';
import type { Query } from './types/query';
import type { IStore, JValue } from './types/store';
import { jsonEncode } from './utils/json';

export type { Query } from './types/query';
export type { IStore, JArray, JObject, JValue } from './types/store';

type Awaitable<T> = Promise<T> | T;
type RNode = [string, string | [string]][];

const NODE_ROOT = '_';
const nextIds = new Map<IStore, { next: number }>();
const mutex = new MutexRW();
export class Radix<TStore extends IStore = IStore> {
  private m_id: { next: number };
  private m_recycleIds = new Set<string>();

  /**
   * Creates a new instance of the Radix class.
   *
   * @param store The store used for data storage.
   */
  public constructor(public store: TStore) {
    this.m_id = nextIds.get(store) ?? { next: -1 };
    nextIds.set(store, this.m_id);
  }

  private nodeSort(node: RNode) {
    return node.sort((a, b) => +(a[0] > b[0]) - 0.5);
  }

  private async nextId() {
    if (this.m_recycleIds.size) {
      const id = this.m_recycleIds.values().next().value as string;
      this.m_recycleIds.delete(id);
      return id;
    }
    if (this.m_id.next < 0) {
      this.m_id.next = await this.store.get<number>(`#`) ?? 0;
    }
    const id = this.m_id.next.toString(36);
    await this.store.set(`#`, ++this.m_id.next);
    return id;
  }

  // TODO: Cover with tests
  /**
   * Checks if a given key exists in the Radix store.
   *
   * @param key The key to check.
   * @returns A Promise that resolves to true if the key exists, and false otherwise.
   */
  public async has(key: string) {
    const release = await mutex.obtainRO();
    try {
      let node = await this.store.get<RNode>(NODE_ROOT) ?? [];
      let trav = !!node;
      while (trav && node) {
        trav = false;
        for (const [n, v] of node) {
          if (n[0] !== key[0]) continue;
          if (key.slice(0, n.length) === n) {
            key = key.slice(n.length, key.length);
            if (!key && Array.isArray(v)) return true;
            node = await this.store.get<RNode>(v as string) ?? [];
            trav = true;
            break;
          }
        }
      }
      return false;
    } finally {
      release();
    }
  }

  /**
   * Retrieves the value associated with a given key in the Radix store.
   *
   * @param key The key to retrieve the value for.
   * @returns A Promise that resolves to the value associated with the key, or undefined if the key is not found.
   */
  public async get<T extends JValue>(key: string) {
    const release = await mutex.obtainRO();
    try {
      let node = await this.store.get<RNode>(NODE_ROOT) ?? [];
      let trav = !!node;
      while (trav && node) {
        trav = false;
        for (const [n, v] of node) {
          if (n[0] !== key[0]) continue;
          if (key.slice(0, n.length) === n) {
            key = key.slice(n.length, key.length);
            if (!key && Array.isArray(v)) return JSON.parse(v[0]) as T;
            node = await this.store.get<RNode>(v as string) ?? [];
            trav = true;
            break;
          }
        }
      }
      return undefined;
    } finally {
      release();
    }
  }

  /**
   * Sets a value for a given key in the Radix store.
   *
   * @param key The key to set the value for.
   * @param value The value to associate with the key.
   * @returns A Promise that resolves when the value is successfully set.
   */
  public async set<T extends JValue>(key: string, value: T) {
    const release = await mutex.obtainRW();
    try {
      const val = [jsonEncode(value)] as [string];
      let nodePathOld = NODE_ROOT;
      let node = await this.store.get<RNode>(nodePathOld) ?? [];
      let traverse = true;
      while (traverse) {
        traverse = false;
        for (let i = 0; i < node.length; ++i) {
          const [k, v] = node[i];
          if (k[0] !== key[0]) continue;
          let kNew = '';
          let kLeft = k;
          while (k && key && kLeft[0] === key[0]) {
            kNew += kLeft.slice(0, 1);
            kLeft = kLeft.slice(1, kLeft.length);
            key = key.slice(1, key.length);
          }
          if (key && !kLeft || k === kNew) {
            if (Array.isArray(v)) {
              if (key === kLeft && !kLeft) {
                node[i] = [k, val];
                await this.store.set(nodePathOld, node);
                return;
              }
            } else {
              nodePathOld = v;
              node = await this.store.get<RNode>(nodePathOld) ?? [];
              traverse = true;
              break;
            }
          }
          const nodePathNew = await this.nextId();
          node.splice(i as unknown as number, 1);
          node.push([kNew, nodePathNew]);
          await this.store.set(nodePathOld, this.nodeSort(node));
          node = [
            [key, val],
            [kLeft, v],
          ];
          await this.store.set(nodePathNew, this.nodeSort(node));
          return;
        }
        if (!traverse && node) {
          node.push([key, val]);
          await this.store.set(nodePathOld, this.nodeSort(node));
          return;
        }
      }
    } finally {
      release();
    }
  }

  /**
   * Deletes a key and its associated value from the Radix store.
   *
   * @param key The key to delete.
   * @returns A Promise that resolves to true if the key was deleted, and false if the key was not found.
   */
  public async del(key: string) {
    const release = await mutex.obtainRW();
    try {
      let curNodePath = NODE_ROOT;
      let node = await this.store.get<RNode>(curNodePath);
      if (!node) return false;
      let trav = !!node;
      const prevNodes = [] as [number, string, string, RNode][];
      while (trav && node) {
        trav = false;
        for (let i = 0; i < node.length; ++i) {
          const [n, v] = node[i];
          if (n[0] !== key[0]) continue;
          if (key.slice(0, n.length) === n) {
            key = key.slice(n.length, key.length);
            if (Array.isArray(v)) {
              node.splice(i, 1);
              switch (node.length) {
                case 0: {
                  console.log('NEW: '); // TODO: remove? Only for root node? Should never be the case
                  // No subnodes left, removing
                  const prevNode = prevNodes.pop();
                  if (!prevNode) return true;
                  const [curI, , curNodePath] = prevNode;
                  await this.store.del(curNodePath);
                  this.m_recycleIds.add(curNodePath);
                  node = await this.store.get<RNode>(curNodePath);
                  if (!node) return true;
                  node.splice(curI, 1);
                  await this.store.set(curNodePath, node);
                  return true;
                }
                case 1: {
                  // One subnode left, collapsing
                  await this.store.del(curNodePath);
                  this.m_recycleIds.add(curNodePath);
                  let prevNode = prevNodes.pop();
                  if (!prevNode) return true;
                  const [prevI, prevN] = prevNode;
                  prevNode = prevNodes.pop() ?? [-1, '', NODE_ROOT, []];
                  const nodeOld = node;
                  [, , curNodePath, node] = prevNode;
                  const fieldNew = nodeOld[0];
                  fieldNew[0] = prevN + fieldNew[0];
                  node.splice(prevI, 1, fieldNew);
                  await this.store.set(curNodePath, node);
                  return true;
                }
                default: {
                  await this.store.set(curNodePath, node);
                  return true;
                }
              }
            }
            curNodePath = v as string;
            node = await this.store.get<RNode>(curNodePath);
            node && prevNodes.push([i, n, curNodePath, node]);
            trav = true;
            break;
          }
        }
      }
      return false;
    } finally {
      release();
    }
  }

  private async *_loop<T extends JValue>(
    query: {
      count: number;
      sort: 0 | 1;
      filter: QueryFilter;
    },
    key = '',
    root = NODE_ROOT,
  ): AsyncGenerator<[string, T], void, unknown> {
    if (!query.count) return;
    const node = await this.store.get<RNode>(root) ?? [];
    for (const i in node) {
      const [k, v] =
        node[query.sort * +i + (1 - query.sort) * (node.length - (+i + 1))];
      const keyAcc = key + k;
      if (Array.isArray(v)) {
        if (!query.filter(keyAcc, false)) {
          continue;
        }
        yield [keyAcc, JSON.parse(v[0]) as T];
        if (!--query.count) return;
        continue;
      }
      if (!query.filter(keyAcc, true)) {
        continue;
      }
      for await (const result of this._loop<T>(query, keyAcc, v)) {
        yield result;
      }
    }
  }

  /**
   * Performs a loop operation to iterate over keys and values in the Radix store based on a query.
   *
   * @param query An optional query object to filter and control the loop operation.
   * @returns An asynchronous generator that yields key-value pairs that match the query criteria.
   */
  public async *loop<T extends JValue>(
    query?: Query,
  ): AsyncGenerator<[string, T], void, unknown> {
    const release = await mutex.obtainRO();
    try {
      for await (const result of this._loop<T>({
        count: query?.count ?? -1,
        sort: query?.sort === -1 ? 0 : 1,
        filter: buildQueryFilter(query),
      })) {
        yield result;
      }
    } finally {
      release();
    }
  }
}

type QueryFilter = (
  path: string,
  isBranch: boolean,
) => Promise<boolean> | boolean;

function escape(value: string, sliceConfig?: boolean) {
  const filter = `'${value.replaceAll(/'/g, "\\'")}'`;
  // Also trims the value for comparison against branch
  return sliceConfig === undefined
    ? `(t?${filter}.slice(0,v.length):${filter})`
    : sliceConfig
    ? `${filter}.slice(0,v.length)`
    : filter;
}

function noFilter() {
  return true;
}

function buildQueryFilter(query?: Query) {
  if (!query) return noFilter;
  let rules = '';
  if (query.gt !== undefined)
    rules += `&&(t?v>=${escape(query.gt, true)}:v>${escape(query.gt, false)})`;
  if (query.gte !== undefined) rules += `&&v>=${escape(query.gte)}`;
  if (query.lt !== undefined)
    rules += `&&(t?v<=${escape(query.lt, true)}:v<${escape(query.lt, false)})`;
  if (query.lte !== undefined) rules += `&&v<=${escape(query.lte)}`;
  if (query.prefixSome !== undefined) {
    const a = query.prefixSome.map(e => escape(e)).join(',');
    rules += `&&[${a}].some(e=>v.slice(0,e.length)===e)`;
  }
  if (query.prefix !== undefined) {
    rules += `&&v.slice(0,${query.prefix.length})===${escape(query.prefix)}`;
  }
  if (query.prefixNot !== undefined) {
    rules += `&&v.slice(0, ${query.prefixNot.length})!==${escape(
      query.prefixNot,
      false,
    )}`;
  }
  // console.log(query, rules ? rules.slice(2) : true);
  return Function('v', 't', `return ${rules ? rules.slice(2) : true}`) as (
    path: string,
    isBranch: boolean,
  ) => Awaitable<boolean>;
}
