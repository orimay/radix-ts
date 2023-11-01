export type JSimple = string | number | boolean | null;
export type JArray = JValue[];
export interface JObject {
  [key: string]: JValue | undefined;
}
export type JValue = JArray | JObject | JSimple;

export interface IStore {
  get: <T extends JValue>(key: string) => Promise<undefined | T>;
  set: <T extends JValue>(key: string, value: T) => Promise<void>;
  del: (key: string) => Promise<void>;
}
