import { db } from "@workspace/db";

export async function withTransaction<T>(
  callback: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    return callback();
  });
}
