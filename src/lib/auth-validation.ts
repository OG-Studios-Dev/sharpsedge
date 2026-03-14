export type LoginInput = {
  email: string;
  password: string;
};

export type SignupInput = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  username?: string | null;
};

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,20}$/;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeUsername(username?: string | null) {
  const trimmed = username?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export function validateEmail(email: string) {
  return EMAIL_REGEX.test(normalizeEmail(email));
}

export function validateLoginInput(input: Partial<LoginInput>): ValidationResult<LoginInput> {
  const email = input.email?.trim() ?? "";
  const password = input.password ?? "";

  if (!email || !password) {
    return {
      success: false,
      error: "Enter both your email address and password.",
    };
  }

  if (!validateEmail(email)) {
    return {
      success: false,
      error: "Enter a valid email address.",
    };
  }

  return {
    success: true,
    data: {
      email: normalizeEmail(email),
      password,
    },
  };
}

export function validateSignupInput(input: Partial<SignupInput>): ValidationResult<{
  name: string;
  email: string;
  password: string;
  username: string | null;
}> {
  const name = input.name?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  const password = input.password ?? "";
  const confirmPassword = input.confirmPassword ?? "";
  const username = normalizeUsername(input.username);

  if (!name) {
    return {
      success: false,
      error: "Enter your full name.",
    };
  }

  if (!validateEmail(email)) {
    return {
      success: false,
      error: "Enter a valid email address.",
    };
  }

  if (password.length < 8) {
    return {
      success: false,
      error: "Password must be at least 8 characters.",
    };
  }

  if (password !== confirmPassword) {
    return {
      success: false,
      error: "Passwords do not match.",
    };
  }

  if (username && !USERNAME_REGEX.test(username)) {
    return {
      success: false,
      error: "Username must be 3-20 characters and use only letters, numbers, dots, dashes, or underscores.",
    };
  }

  return {
    success: true,
    data: {
      name,
      email: normalizeEmail(email),
      password,
      username,
    },
  };
}
