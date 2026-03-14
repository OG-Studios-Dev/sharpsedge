import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { validateSignupInput } from "@/lib/auth-validation";
import { createUser, findUserByEmail, findUserByUsername, toSessionUser } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const validation = validateSignupInput(body ?? {});

  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (await findUserByEmail(validation.data.email)) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  if (validation.data.username && await findUserByUsername(validation.data.username)) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }

  try {
    const passwordHash = await hash(validation.data.password, 12);
    const user = await createUser({
      name: validation.data.name,
      email: validation.data.email,
      username: validation.data.username,
      passwordHash,
    });

    return NextResponse.json({ user: toSessionUser(user) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create account.";
    const status = /already exists|already taken/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
