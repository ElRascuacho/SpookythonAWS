import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import type {
  GetItemCommandInput,
  TransactWriteItemsCommandInput,
  UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";

/**
 * High-fidelity in-memory DynamoDB client simulator for unit testing
 * condition expressions, atomic transactions, and CAS semantics
 * without depending on external Docker/DynamoDB Local.
 */
export class InMemoryDynamoDBClient {
  private tables = new Map<string, Map<string, Record<string, any>>>();

  private getTable(tableName: string) {
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, new Map());
    }
    return this.tables.get(tableName)!;
  }

  private itemKey(pk: string, sk: string): string {
    return `${pk}###${sk}`;
  }

  async send(command: any): Promise<any> {
    const cmdName = command.constructor?.name ?? "";
    const input = command.input ?? {};

    if (cmdName === "GetItemCommand" || (input.Key && !input.UpdateExpression)) {
      return this.handleGetItem(input);
    }
    if (cmdName === "UpdateItemCommand" || input.UpdateExpression) {
      return this.handleUpdateItem(input);
    }
    if (cmdName === "TransactWriteItemsCommand" || input.TransactItems) {
      return this.handleTransactWriteItems(input);
    }

    throw new Error(`Unsupported command in simulator: ${cmdName}`);
  }

  private handleGetItem(input: GetItemCommandInput) {
    const table = this.getTable(input.TableName!);
    const key = unmarshall(input.Key!);
    const stored = table.get(this.itemKey(key.pk, key.sk));
    return {
      Item: stored ? marshall(stored, { removeUndefinedValues: true }) : undefined,
    };
  }

  private evaluateCondition(
    condition: string | undefined,
    item: Record<string, any> | undefined,
    names: Record<string, string> = {},
    values: Record<string, any> = {},
  ): boolean {
    if (!condition) return true;

    let trimmed = condition.trim();

    // Strip redundant outer parentheses if they wrap the entire expression
    while (trimmed.startsWith("(") && trimmed.endsWith(")")) {
      let depth = 0;
      let matchedEnd = true;
      for (let i = 0; i < trimmed.length - 1; i++) {
        if (trimmed[i] === "(") depth++;
        else if (trimmed[i] === ")") depth--;
        if (depth === 0) {
          matchedEnd = false;
          break;
        }
      }
      if (matchedEnd) {
        trimmed = trimmed.slice(1, -1).trim();
      } else {
        break;
      }
    }

    // Top-level split respecting parentheses
    const splitTopLevel = (expr: string, op: " OR " | " AND "): string[] | null => {
      const parts: string[] = [];
      let depth = 0;
      let lastIndex = 0;
      const opLen = op.length;

      for (let i = 0; i <= expr.length - opLen; i++) {
        const char = expr[i];
        if (char === "(") depth++;
        else if (char === ")") depth--;
        else if (depth === 0 && expr.slice(i, i + opLen) === op) {
          parts.push(expr.slice(lastIndex, i).trim());
          lastIndex = i + opLen;
          i += opLen - 1;
        }
      }
      if (parts.length > 0) {
        parts.push(expr.slice(lastIndex).trim());
        return parts;
      }
      return null;
    };

    // 1. Check top-level OR branches (lowest precedence)
    const orBranches = splitTopLevel(trimmed, " OR ");
    if (orBranches) {
      return orBranches.some((branch) =>
        this.evaluateCondition(branch, item, names, values),
      );
    }

    // 2. Check top-level AND branches (higher precedence than OR)
    const andBranches = splitTopLevel(trimmed, " AND ");
    if (andBranches) {
      return andBranches.every((branch) =>
        this.evaluateCondition(branch, item, names, values),
      );
    }

    // Helper to resolve expression attribute names and values
    const resolveAttr = (attrRef: string): any => {
      const cleanRef = attrRef.trim();
      const realName = names[cleanRef] ?? cleanRef;
      return item ? item[realName] : undefined;
    };

    const resolveVal = (valRef: string): any => {
      const cleanRef = valRef.trim();
      if (values[cleanRef] !== undefined) {
        return unmarshall({ v: values[cleanRef] }).v;
      }
      if (cleanRef.startsWith("'") && cleanRef.endsWith("'")) {
        return cleanRef.slice(1, -1);
      }
      return cleanRef;
    };

    if (trimmed.startsWith("attribute_not_exists(")) {
      const attrRef = trimmed.slice("attribute_not_exists(".length, -1);
      const val = resolveAttr(attrRef);
      return val === undefined;
    }

    if (trimmed.startsWith("attribute_exists(")) {
      const attrRef = trimmed.slice("attribute_exists(".length, -1);
      const val = resolveAttr(attrRef);
      return val !== undefined;
    }

    if (trimmed.includes(" IN ")) {
      const [attrRef, listRef] = trimmed.split(" IN ");
      const val = resolveAttr(attrRef);
      const listItems = listRef
        .replace(/^\(|\)$/g, "")
        .split(",")
        .map((x) => resolveVal(x));
      return listItems.includes(val);
    }

    if (trimmed.includes(" <= ")) {
      const [left, right] = trimmed.split(" <= ");
      const lVal = resolveAttr(left) ?? 0;
      const rVal = resolveVal(right);
      return lVal <= rVal;
    }

    if (trimmed.includes(" < ")) {
      const [left, right] = trimmed.split(" < ");
      const lVal = resolveAttr(left) ?? 0;
      const rVal = resolveVal(right);
      return lVal < rVal;
    }

    if (trimmed.includes(" = ")) {
      const [left, right] = trimmed.split(" = ");
      const lVal = resolveAttr(left);
      const rVal = resolveVal(right);
      return lVal === rVal;
    }

    return true;
  }

  private applyUpdate(
    item: Record<string, any> = {},
    updateExpr: string,
    names: Record<string, string> = {},
    values: Record<string, any> = {},
  ): Record<string, any> {
    const next = { ...item };

    const resolveVal = (valRef: string): any => {
      const cleanRef = valRef.trim();
      if (values[cleanRef] !== undefined) {
        return unmarshall({ v: values[cleanRef] }).v;
      }
      return cleanRef;
    };

    const resolveName = (nameRef: string): string => {
      const clean = nameRef.trim();
      return names[clean] ?? clean;
    };

    // Parse clauses: SET ..., ADD ..., REMOVE ...
    const clauses: Array<{ type: "SET" | "ADD" | "REMOVE"; body: string }> = [];
    const matches = [...updateExpr.matchAll(/\b(SET|ADD|REMOVE)\b/g)];
    for (let i = 0; i < matches.length; i++) {
      const type = matches[i][1] as "SET" | "ADD" | "REMOVE";
      const start = matches[i].index! + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index! : updateExpr.length;
      clauses.push({ type, body: updateExpr.slice(start, end).trim() });
    }

    for (const clause of clauses) {
      if (clause.type === "SET") {
        const assignments = clause.body.split(",");
        for (const assign of assignments) {
          const eqIdx = assign.indexOf("=");
          if (eqIdx === -1) continue;
          const left = assign.slice(0, eqIdx).trim();
          const right = assign.slice(eqIdx + 1).trim();
          const attr = resolveName(left);

          if (right.includes("if_not_exists(")) {
            const match = right.match(/if_not_exists\(([^,]+),\s*([^)]+)\)/);
            if (match) {
              const fallback = resolveVal(match[2]);
              if (next[attr] === undefined) {
                next[attr] = fallback;
              }
            }
          } else if (right.includes(" + ")) {
            const [opLeft, opRight] = right.split(" + ").map((s) => s.trim());
            const curVal = next[resolveName(opLeft)] ?? 0;
            const incVal = resolveVal(opRight);
            next[attr] = curVal + incVal;
          } else {
            next[attr] = resolveVal(right);
          }
        }
      } else if (clause.type === "ADD") {
        const adds = clause.body.split(",");
        for (const add of adds) {
          const parts = add.trim().split(/\s+/);
          if (parts.length < 2) continue;
          const attr = resolveName(parts[0]);
          const addVal = resolveVal(parts[1]);
          next[attr] = (next[attr] ?? 0) + addVal;
        }
      } else if (clause.type === "REMOVE") {
        const removes = clause.body.split(",");
        for (const rem of removes) {
          const attr = resolveName(rem.trim());
          delete next[attr];
        }
      }
    }

    return next;
  }

  private handleUpdateItem(input: UpdateItemCommandInput) {
    const table = this.getTable(input.TableName!);
    const key = unmarshall(input.Key!);
    const itemKeyStr = this.itemKey(key.pk, key.sk);
    const existing = table.get(itemKeyStr);

    const conditionOk = this.evaluateCondition(
      input.ConditionExpression,
      existing,
      input.ExpressionAttributeNames as any,
      input.ExpressionAttributeValues as any,
    );

    if (!conditionOk) {
      const error: any = new Error("Conditional check failed");
      error.name = "ConditionalCheckFailedException";
      throw error;
    }

    const updated = this.applyUpdate(
      existing ?? { pk: key.pk, sk: key.sk },
      input.UpdateExpression!,
      input.ExpressionAttributeNames as any,
      input.ExpressionAttributeValues as any,
    );
    table.set(itemKeyStr, updated);
    return {};
  }

  private handleTransactWriteItems(input: TransactWriteItemsCommandInput) {
    const reasons: Array<{ Code?: string; Message?: string }> = [];
    let hasFailure = false;

    // Check conditions first for all items
    for (const item of input.TransactItems!) {
      if (item.Put) {
        const table = this.getTable(item.Put.TableName!);
        const unmarshalled = unmarshall(item.Put.Item!);
        const existing = table.get(this.itemKey(unmarshalled.pk, unmarshalled.sk));
        const ok = this.evaluateCondition(
          item.Put.ConditionExpression,
          existing,
          item.Put.ExpressionAttributeNames as any,
          item.Put.ExpressionAttributeValues as any,
        );
        if (!ok) {
          hasFailure = true;
          reasons.push({ Code: "ConditionalCheckFailed" });
        } else {
          reasons.push({ Code: "None" });
        }
      } else if (item.Update) {
        const table = this.getTable(item.Update.TableName!);
        const key = unmarshall(item.Update.Key!);
        const existing = table.get(this.itemKey(key.pk, key.sk));
        const ok = this.evaluateCondition(
          item.Update.ConditionExpression,
          existing,
          item.Update.ExpressionAttributeNames as any,
          item.Update.ExpressionAttributeValues as any,
        );
        if (!ok) {
          hasFailure = true;
          reasons.push({ Code: "ConditionalCheckFailed" });
        } else {
          reasons.push({ Code: "None" });
        }
      }
    }

    if (hasFailure) {
      const error: any = new Error("Transaction cancelled, check reasons");
      error.name = "TransactionCanceledException";
      error.CancellationReasons = reasons;
      throw error;
    }

    // Apply all changes atomically
    for (const item of input.TransactItems!) {
      if (item.Put) {
        const table = this.getTable(item.Put.TableName!);
        const unmarshalled = unmarshall(item.Put.Item!);
        table.set(this.itemKey(unmarshalled.pk, unmarshalled.sk), unmarshalled);
      } else if (item.Update) {
        const table = this.getTable(item.Update.TableName!);
        const key = unmarshall(item.Update.Key!);
        const itemKeyStr = this.itemKey(key.pk, key.sk);
        const existing = table.get(itemKeyStr);
        const updated = this.applyUpdate(
          existing ?? { pk: key.pk, sk: key.sk },
          item.Update.UpdateExpression!,
          item.Update.ExpressionAttributeNames as any,
          item.Update.ExpressionAttributeValues as any,
        );
        table.set(itemKeyStr, updated);
      }
    }
    return {} as any;
  }
}


