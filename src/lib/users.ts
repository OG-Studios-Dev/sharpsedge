import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { normalizeEmail, normalizeUsername } from "@/lib/auth-validation";

export type UserRole = "user" | "admin";

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
};

type CreateUserInput = {
  name: string;
  email: string;
  username?: string | null;
  passwordHash: string;
  role?: UserRole;
};

const PRIMARY_USERS_FILE = path.join(process.cwd(), "data", "users.json");
const EPHEMERAL_USERS_FILE = path.join("/tmp", "goosalytics", "users.json");

function getUsersFilePath() {
  return process.env.VERCEL ? EPHEMERAL_USERS_FILE : PRIMARY_USERS_FILE;
}

async function ensureFileExists(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code !== "ENOENT") {
      throw error;
    }

    let initialContents = "[]\n";

    if (filePath === EPHEMERAL_USERS_FILE) {
      try {
        initialContents = await readFile(PRIMARY_USERS_FILE, "utf8");
      } catch {
        initialContents = "[]\n";
      }
    }

    await writeFile(filePath, initialContents, "utf8");
  }
}

async function readUsers(): Promise<StoredUser[]> {
  const filePath = getUsersFilePath();
  await ensureFileExists(filePath);

  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("The users file is not a valid user array.");
  }

  return parsed.map((user) => ({
    ...user,
    email: normalizeEmail(String(user?.email ?? "")),
    username: normalizeUsername(typeof user?.username === "string" ? user.username : null),
    role: user?.role === "admin" ? "admin" : "user",
    lastLoginAt: typeof user?.lastLoginAt === "string" ? user.lastLoginAt : null,
  })) as StoredUser[];
}

async function writeUsers(users: StoredUser[]) {
  const filePath = getUsersFilePath();
  await ensureFileExists(filePath);
  await writeFile(filePath, `${JSON.stringify(users, null, 2)}\n`, "utf8");
}

export function toSessionUser(user: StoredUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function findUserByEmail(email: string) {
  const users = await readUsers();
  const normalizedEmail = normalizeEmail(email);
  return users.find((user) => user.email === normalizedEmail) ?? null;
}

export async function findUserByUsername(username: string) {
  const users = await readUsers();
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) {
    return null;
  }

  return users.find((user) => user.username === normalizedUsername) ?? null;
}

export async function createUser(input: CreateUserInput) {
  const users = await readUsers();
  const email = normalizeEmail(input.email);
  const username = normalizeUsername(input.username);

  if (users.some((user) => user.email === email)) {
    throw new Error("A user with that email already exists.");
  }

  if (username && users.some((user) => user.username === username)) {
    throw new Error("That username is already taken.");
  }

  const user: StoredUser = {
    id: randomUUID(),
    name: input.name.trim(),
    email,
    username,
    passwordHash: input.passwordHash,
    role: input.role ?? "user",
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  users.push(user);
  await writeUsers(users);

  return user;
}

export async function listUsers() {
  const users = await readUsers();
  return [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateUserLastLogin(userId: string) {
  const users = await readUsers();
  const index = users.findIndex((user) => user.id === userId);

  if (index < 0) {
    return null;
  }

  const updatedUser: StoredUser = {
    ...users[index],
    lastLoginAt: new Date().toISOString(),
  };

  users[index] = updatedUser;
  await writeUsers(users);

  return updatedUser;
}

export async function deleteUserById(userId: string) {
  const users = await readUsers();
  const targetUser = users.find((user) => user.id === userId);

  if (!targetUser) {
    return false;
  }

  if (targetUser.role === "admin") {
    throw new Error("Admin accounts cannot be deleted.");
  }

  const remainingUsers = users.filter((user) => user.id !== userId);
  await writeUsers(remainingUsers);
  return true;
}
