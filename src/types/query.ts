export type Query = {
  prefix?: string;
  prefixNot?: string;
  prefixSome?: string[]; // TODO: Cover with tests
  gt?: string;
  gte?: string;
  lt?: string;
  lte?: string;
  count?: number;
  sort?: -1 | 1;
};
