# radix-ts

`radix-ts` is a powerful Radix data storage and retrieval library for
TypeScript. It allows you to efficiently store and manage structured data using
a Radix tree data structure.

## Installation

You can install `radix-ts` via npm or yarn:

```bash
npm install radix-ts
# or
yarn add radix-ts
```

## Usage

To use `radix-ts`, you need to import and create an instance of the `Radix`
class with your custom store implementation. Here's a basic example using an
in-memory store:

```typescript
import { Radix } from 'radix-ts';

class StoreInMemory {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    return this.store.get(key);
  }

  async set(key, value) {
    this.store.set(key, value);
  }

  async del(key) {
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

const store = new StoreInMemory();
const radix = new Radix(store);

(async () => {
  // Example key and value
  const key = 'example_key';
  const value = 'example_value';

  // Set a value for a key
  await radix.set(key, value);
  console.log(await radix.get(key)); // Should output 'example_value'
  console.log(await radix.has(key)); // Should output true

  // Delete a key
  await radix.del(key);
  console.log(await radix.get(key)); // Should output undefined
  console.log(await radix.has(key)); // Should output false

  await radix.set('example_key_a1', 1);
  await radix.set('example_key_a2', 1);
  await radix.set('example_key_b1', 1);
  await radix.set('example_key_b3', 3);
  await radix.set('example_key_b4', 4);
  await radix.set('example_key_b2', 2);
  await radix.set('example_key_b5', 5);

  // Loop through the data
  const query = {
    count: 4, // To retrieve four matching keys and values
    sort: 0, // Sort in descending order (1 for ascending)
    prefix: 'example_key_b', // Only return values with specified key prefix
  };

  // Use the loop method to iterate over keys and values
  for await (const [key, value] of radix.loop(query)) {
    console.log(value); // Outputs 5, 4, 3, 2
  }
})();
```

Make sure to replace the store implementation with your custom store if needed.
The `loop` method is used to iterate over keys and values in the Radix store
based on the provided query.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

## Authors

- Dmitrii Baranov <dmitrii.a.baranov@gmail.com>
