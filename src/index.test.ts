import * as faker from 'faker';
import { describe, expect, it } from 'vitest';
import { Radix } from '.';
import type { IStore } from './types/store';

class StoreInMemory implements IStore {
  private store = new Map<string, unknown>();

  async get<T>(key: string) {
    return this.store.get(key) as T;
  }

  async set<T>(key: string, value: T) {
    this.store.set(key, value);
  }

  async del(key: string) {
    this.store.delete(key);
  }

  toString(pathsOnly = false) {
    return JSON.stringify(
      pathsOnly
        ? [...this.store.keys()]
        : Object.fromEntries(this.store.entries()),
      null,
      2,
    );
  }
}

describe('radix', () => {
  const SKIP_LARGE_DATA = false;

  function newValue() {
    return faker.lorem.word();
  }

  it('has no non-placed value', async () => {
    const radix = new Radix(new StoreInMemory());
    const result = await radix.get('');
    expect(result).toBeUndefined();
  });

  it('has no non-placed value with known prefix', async () => {
    const radix = new Radix(new StoreInMemory());
    await radix.set('co', newValue());
    const result = await radix.get('cow');
    expect(result).toBeUndefined();
  });

  it('has no deleted value', async () => {
    const values = [
      ['co', newValue()],
      ['coin', newValue()],
      ['coinbase', newValue()],
      ['community', newValue()],
      ['cow', newValue()],
      ['coweb', newValue()],
      ['coworker', newValue()],
    ] as [string, string][];
    for (let i = 0; i < values.length; ++i) {
      const radix = new Radix(new StoreInMemory());
      for (const [key, value] of values) {
        await radix.set(key, value);
      }
      expect(await radix.del(values[i][0])).toBe(true);
      for (let j = 0; j < values.length; ++j) {
        const [key, value] = values[j];
        const valueFound = await radix.get(key);
        if (i === j) {
          expect(valueFound).toBeUndefined();
        } else {
          expect(valueFound).toEqual(value);
        }
      }
    }
  });

  it('can place value', async () => {
    const radix = new Radix(new StoreInMemory());
    const value = newValue();
    await radix.set('cow', value);
    const result = await radix.get('cow');
    expect(result).toEqual(value);
  });

  it('can store complex value', async () => {
    const radix = new Radix(new StoreInMemory());
    const value = [{ a: newValue(), b: [newValue(), newValue()] }];
    await radix.set('v', value);
    const result = await radix.get('v');
    expect(result).toEqual(value);
  });

  it('can place value', async () => {
    const radix = new Radix(new StoreInMemory());
    const value = newValue();
    await radix.set('cow', value);
    const result = await radix.get('cow');
    expect(result).toEqual(value);
  });

  it('can place intersecting values', async () => {
    const radix = new Radix(new StoreInMemory());
    const value1 = newValue();
    const value2 = newValue();
    await radix.set('cow', value1);
    await radix.set('combo', value2);
    expect(await radix.get('cow')).toEqual(value1);
    expect(await radix.get('combo')).toEqual(value2);
  });

  it('can shadow keys', async () => {
    const store = new StoreInMemory();
    const radix = new Radix(store);
    const value1 = newValue();
    const value2 = newValue();
    const value3 = newValue();
    await radix.set('cow', value1);
    await radix.set('coweb', value2);
    await radix.set('co', value3);
    expect(await radix.get('cow')).toEqual(value1);
    expect(await radix.get('coweb')).toEqual(value2);
    expect(await radix.get('co')).toEqual(value3);
  });

  it('can override data', async () => {
    const store = new StoreInMemory();
    const radix = new Radix(store);
    const value1 = newValue();
    const value2 = newValue();
    await radix.set('cow', value1);
    await radix.set('cow', value2);
    expect(await radix.get('cow')).toEqual(value2);
  });

  it.skipIf(SKIP_LARGE_DATA)('can store a lot of data', async () => {
    const store = new StoreInMemory();
    const radix = new Radix(store);

    const values = {} as Record<string, string>;
    for (let i = 0; i < 1000; ++i) {
      const key = Math.random()
        .toString(36)
        .slice(2, 3 + Math.round(Math.random() * 10));
      const value = newValue();
      values[key] = value;
      await radix.set(key, value);
    }

    for (const key in values) {
      const value = values[key];
      expect(await radix.get(key)).toEqual(value);
    }
  });

  it.skipIf(SKIP_LARGE_DATA)(
    'loops over random collection in order',
    async () => {
      const store = new StoreInMemory();
      const radix = new Radix(store);
      const keys = new Set<string>();
      for (let i = 0; i < 1000; ++i) {
        const key = Math.random().toString(36).slice(2, 12);
        await radix.set(key, newValue());
        keys.add(key);
      }
      const keysSorted = [...keys].sort();
      const keysFound: string[] = [];
      for await (const [key] of radix.loop()) {
        keysFound.push(key);
      }
      expect(keysFound).toEqual(keysSorted);
    },
  );

  it.skipIf(SKIP_LARGE_DATA)('loops with backwards sorting', async () => {
    const store = new StoreInMemory();
    const radix = new Radix(store);
    const keys = new Set<string>();
    for (let i = 0; i < 1000; ++i) {
      const key = Math.random().toString(36).slice(2, 12);
      await radix.set(key, newValue());
      keys.add(key);
    }
    const keysSorted = [...keys].sort().reverse();
    const keysFound: string[] = [];
    for await (const [key] of radix.loop({ sort: -1 })) {
      keysFound.push(key);
    }
    expect(keysFound).toEqual(keysSorted);
  });

  it('loops with gt filter', async () => {
    const store = new StoreInMemory();
    const radix = new Radix(store);
    await radix.set('a', newValue());
    await radix.set('b', newValue());
    await radix.set('c', newValue());
    await radix.set('d', newValue());
    const keysFound: string[] = [];
    for await (const [key] of radix.loop({ gt: 'b' })) {
      keysFound.push(key);
    }
    expect(keysFound).toEqual(['c', 'd']);
  });

  it('loops with gte filter', async () => {
    const store = new StoreInMemory();
    const radix = new Radix(store);
    await radix.set('a', newValue());
    await radix.set('b', newValue());
    await radix.set('c', newValue());
    await radix.set('d', newValue());
    const keysFound: string[] = [];
    for await (const [key] of radix.loop({ gte: 'b' })) {
      keysFound.push(key);
    }
    expect(keysFound).toEqual(['b', 'c', 'd']);
  });

  it('loops with lt filter', async () => {
    const store = new StoreInMemory();
    const radix = new Radix(store);
    await radix.set('a', newValue());
    await radix.set('b', newValue());
    await radix.set('c', newValue());
    await radix.set('d', newValue());
    const keysFound: string[] = [];
    for await (const [key] of radix.loop({ lt: 'c' })) {
      keysFound.push(key);
    }
    expect(keysFound).toEqual(['a', 'b']);
  });

  it('loops with lte filter', async () => {
    const store = new StoreInMemory();
    const radix = new Radix(store);
    await radix.set('a', newValue());
    await radix.set('b', newValue());
    await radix.set('c', newValue());
    await radix.set('d', newValue());
    const keysFound: string[] = [];
    for await (const [key] of radix.loop({ lte: 'c' })) {
      keysFound.push(key);
    }
    expect(keysFound).toEqual(['a', 'b', 'c']);
  });

  it('loops with prefix filter', async () => {
    const store = new StoreInMemory();
    const radix = new Radix(store);
    await radix.set('a', newValue());
    await radix.set('b', newValue());
    await radix.set('ba', newValue());
    await radix.set('bb', newValue());
    await radix.set('bc', newValue());
    await radix.set('c', newValue());
    const keysFound: string[] = [];
    for await (const [key] of radix.loop({ prefix: 'b' })) {
      keysFound.push(key);
    }
    expect(keysFound).toEqual(['b', 'ba', 'bb', 'bc']);
  });

  it('loops with count filter', async () => {
    const store = new StoreInMemory();
    const radix = new Radix(store);
    await radix.set('a', newValue());
    await radix.set('b', newValue());
    await radix.set('c', newValue());
    const keysFound: string[] = [];
    for await (const [key] of radix.loop({ count: 2 })) {
      keysFound.push(key);
    }
    expect(keysFound).toEqual(['a', 'b']);
  });

  it('loops with gte + lte + prefix filters', async () => {
    const store = new StoreInMemory();
    const radix = new Radix(store);
    await radix.set('a', newValue());
    await radix.set('b', newValue());
    await radix.set('bb', newValue());
    await radix.set('bc', newValue());
    await radix.set('bd', newValue());
    await radix.set('c', newValue());
    const keysFound: string[] = [];
    for await (const [key] of radix.loop({
      gte: 'bb',
      lte: 'bd',
      prefix: 'b',
    })) {
      keysFound.push(key);
    }
    expect(keysFound).toEqual(['bb', 'bc', 'bd']);
  });

  it("doesn't delete extra values with common key prefix", async () => {
    const store = new StoreInMemory();
    const radix = new Radix(store);
    const key1 = 'fan';
    const key2 = 'factorial';
    const key3 = 'factory';
    await radix.set(key1, newValue());
    await radix.set(key2, newValue());
    await radix.set(key3, newValue());
    await radix.del(key3);
    expect(await radix.get(key1)).toBeTruthy();
    expect(await radix.get(key2)).toBeTruthy();
    await radix.del(key2);
    expect(await radix.get(key1)).toBeTruthy();
  });
});
