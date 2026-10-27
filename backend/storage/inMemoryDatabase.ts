export interface DatabaseItem {
  PK: string;
  SK: string;
  [key: string]: any;
}

export type TransactWriteAction =
  | {
      type: "Update";
      PK: string;
      SK: string;
      condition?: (existing: DatabaseItem | undefined) => boolean;
      update: (existing: DatabaseItem) => void;
    }
  | {
      type: "Put";
      item: DatabaseItem;
      condition?: (existing: DatabaseItem | undefined) => boolean;
    }
  | {
      type: "Delete";
      PK: string;
      SK: string;
      condition?: (existing: DatabaseItem | undefined) => boolean;
    };

export class InMemoryDatabase {
  private items = new Map<string, DatabaseItem>();

  private makeKey(pk: string, sk: string): string {
    return `${pk}##${sk}`;
  }

  async getItem(pk: string, sk: string): Promise<DatabaseItem | null> {
    const key = this.makeKey(pk, sk);
    const item = this.items.get(key);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async putItem(item: DatabaseItem): Promise<void> {
    const key = this.makeKey(item.PK, item.SK);
    this.items.set(key, JSON.parse(JSON.stringify(item)));
  }

  async deleteItem(pk: string, sk: string): Promise<void> {
    const key = this.makeKey(pk, sk);
    this.items.delete(key);
  }

  async transactWrite(actions: TransactWriteAction[]): Promise<void> {
    // 1. Verify all preconditions before mutating any state
    for (const action of actions) {
      if (action.type === "Update" || action.type === "Delete") {
        const key = this.makeKey(action.PK, action.SK);
        const existing = this.items.get(key);
        if (action.condition && !action.condition(existing)) {
          throw new Error(`Transaction condition failed for key ${action.PK} / ${action.SK}`);
        }
      } else if (action.type === "Put") {
        const key = this.makeKey(action.item.PK, action.item.SK);
        const existing = this.items.get(key);
        if (action.condition && !action.condition(existing)) {
          throw new Error(`Transaction condition failed for item ${action.item.PK} / ${action.item.SK}`);
        }
      }
    }

    // 2. Apply all mutations
    for (const action of actions) {
      if (action.type === "Update") {
        const key = this.makeKey(action.PK, action.SK);
        let existing = this.items.get(key);
        if (!existing) {
          existing = { PK: action.PK, SK: action.SK };
          this.items.set(key, existing);
        }
        action.update(existing);
      } else if (action.type === "Put") {
        const key = this.makeKey(action.item.PK, action.item.SK);
        this.items.set(key, JSON.parse(JSON.stringify(action.item)));
      } else if (action.type === "Delete") {
        const key = this.makeKey(action.PK, action.SK);
        this.items.delete(key);
      }
    }
  }

  async queryGSI1(gsi1pk: string): Promise<DatabaseItem[]> {
    const results: DatabaseItem[] = [];
    for (const item of this.items.values()) {
      if (item.GSI1PK === gsi1pk) {
        results.push(JSON.parse(JSON.stringify(item)));
      }
    }
    // Sort descending by GSI1SK (timestamp)
    return results.sort((a, b) => (b.GSI1SK ?? "").localeCompare(a.GSI1SK ?? ""));
  }

  async queryGSI2(gsi2pk: string): Promise<DatabaseItem[]> {
    const results: DatabaseItem[] = [];
    for (const item of this.items.values()) {
      if (item.GSI2PK === gsi2pk) {
        results.push(JSON.parse(JSON.stringify(item)));
      }
    }
    return results.sort((a, b) => (b.GSI2SK ?? "").localeCompare(a.GSI2SK ?? ""));
  }

  async queryGSI3(gsi3pk: string, dueBeforeIso?: string): Promise<DatabaseItem[]> {
    const results: DatabaseItem[] = [];
    for (const item of this.items.values()) {
      if (item.GSI3PK === gsi3pk) {
        if (!dueBeforeIso || (item.GSI3SK && item.GSI3SK <= dueBeforeIso)) {
          results.push(JSON.parse(JSON.stringify(item)));
        }
      }
    }
    return results.sort((a, b) => (a.GSI3SK ?? "").localeCompare(b.GSI3SK ?? ""));
  }

  async scanAll(): Promise<DatabaseItem[]> {
    return Array.from(this.items.values()).map((it) => JSON.parse(JSON.stringify(it)));
  }
}
